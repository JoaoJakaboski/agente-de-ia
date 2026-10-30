const express = require("express");
const { supabase } = require("../db/client");
const { exigirSessao } = require("./sessao");
const { enviarMensagemWhatsapp } = require("../services/evolutionService");
const { registrarMensagem } = require("../services/mensagensService");
const { buscarConfiguracaoAgente, horasInatividadeDaConfiguracao } = require("../services/configuracaoAgenteService");
const { reagendarFechamentoAutomatico } = require("../queue/fechamentoQueue");
const { UUID, agora, primeiroNome, limparNome, instanciaDaEmpresa } = require("./comum");

const router = express.Router();
router.use(exigirSessao);

const LIMITE_TEXTO = 4000;
const LIMITE_OBSERVACAO = 500;
const MOTIVOS_DO_PAINEL = ["resolvido_humano", "abandonado", "fora_do_escopo", "outro"];
const MENSAGEM_ENCERRAMENTO = "Seu atendimento foi encerrado. Se precisar de algo, é só mandar uma nova mensagem! 🙂";

// as gravações usam a service_role (que ignora o RLS), então antes de tudo
// o chamado é lido com o cliente do usuário: se o RLS não devolver, não é da empresa dele
async function carregarChamado(req, res) {
  const { id } = req.params;
  if (!UUID.test(id)) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }

  const { data, error } = await req.db
    .from("chamados")
    .select("id, empresa_id, status, atendente_id, telefone_cliente")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }
  return data;
}

router.post("/:id/nome", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).json({ erro: "nao_encontrado" });

    // com o token do atendente: só encontra se a RLS deixar ver o chamado
    const { data: chamado, error: erroConsulta } = await req.db
      .from("chamados").select("cliente_id").eq("id", id).maybeSingle();
    if (erroConsulta) throw erroConsulta;
    if (!chamado) return res.status(404).json({ erro: "nao_encontrado" });

    const nome = limparNome(req.body && req.body.nome);
    if (nome === undefined) return res.status(400).json({ erro: "dados_invalidos" });

    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("clientes")
      .update({ nome, atualizado_em: agora })
      .eq("id", chamado.cliente_id);
    if (error) throw error;

    // o tempo real escuta "chamados": tocar os chamados abertos desse cliente avisa os outros painéis
    await supabase
      .from("chamados")
      .update({ atualizado_em: agora })
      .eq("cliente_id", chamado.cliente_id)
      .neq("status", "encerrado");

    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/assumir", async (req, res, next) => {
  try {
    const chamado = await carregarChamado(req, res);
    if (!chamado) return;

    // atendente: assume da fila, do bot ou da equipe pelo celular.
    // Administrador (supervisor): também assume de outro atendente
    let consulta = supabase
      .from("chamados")
      .update({ status: "em_atendimento_humano", atendente_id: req.usuario.id, atualizado_em: agora() })
      .eq("id", chamado.id)
      .eq("empresa_id", req.usuario.empresaId);

    consulta = req.usuario.papel === "admin"
      ? consulta
          .in("status", ["aguardando_humano", "bot", "agente", "em_atendimento_humano"])
          .or(`atendente_id.is.null,atendente_id.neq.${req.usuario.id}`)
      : consulta.or("status.in.(aguardando_humano,bot,agente),and(status.eq.em_atendimento_humano,atendente_id.is.null)");

    const { data, error } = await consulta.select("id");

    if (error) throw error;
    if (data.length === 0) return res.status(409).json({ erro: "ja_assumido" });

    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/mensagens", async (req, res, next) => {
  try {
    const texto = typeof req.body.texto === "string" ? req.body.texto.trim() : "";
    if (!texto || texto.length > LIMITE_TEXTO) return res.status(400).json({ erro: "dados_invalidos" });

    const chamado = await carregarChamado(req, res);
    if (!chamado) return;

    if (chamado.status !== "em_atendimento_humano" || chamado.atendente_id !== req.usuario.id) {
      return res.status(409).json({ erro: "nao_e_seu" });
    }

    // no WhatsApp vai com o nome do atendente; no banco fica só o texto, com o atendente_id
    const instancia = await instanciaDaEmpresa(chamado.empresa_id);
    const enviada = await enviarMensagemWhatsapp(
      instancia,
      chamado.telefone_cliente,
      `*${primeiroNome(req.usuario.nome)}:* ${texto}`
    );
    if (!enviada) return res.status(502).json({ erro: "falha_envio" });

    await registrarMensagem(chamado.id, chamado.empresa_id, "humano", texto, req.usuario.id);
    res.status(201).json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/encerrar", async (req, res, next) => {
  try {
    const { motivo } = req.body;
    const observacao = typeof req.body.observacao === "string" ? req.body.observacao.trim() : "";

    if (!MOTIVOS_DO_PAINEL.includes(motivo)) return res.status(400).json({ erro: "dados_invalidos" });
    if (motivo === "outro" && (!observacao || observacao.length > LIMITE_OBSERVACAO)) {
      return res.status(400).json({ erro: "dados_invalidos" });
    }

    const chamado = await carregarChamado(req, res);
    if (!chamado) return;

    const momento = agora();
    const { data, error } = await supabase
      .from("chamados")
      .update({
        status: "encerrado",
        motivo_encerramento: motivo,
        observacao_encerramento: motivo === "outro" ? observacao : null,
        encerrado_em: momento,
        atualizado_em: momento,
      })
      .eq("id", chamado.id)
      .eq("empresa_id", req.usuario.empresaId)
      .eq("status", "em_atendimento_humano")
      .eq("atendente_id", req.usuario.id)
      .select("id");

    if (error) throw error;
    if (data.length === 0) return res.status(409).json({ erro: "nao_e_seu" });

    const instancia = await instanciaDaEmpresa(chamado.empresa_id);
    const enviada = await enviarMensagemWhatsapp(instancia, chamado.telefone_cliente, MENSAGEM_ENCERRAMENTO);
    if (enviada) await registrarMensagem(chamado.id, chamado.empresa_id, "bot", MENSAGEM_ENCERRAMENTO);

    // o chamado fica encerrado mesmo se o WhatsApp recusar a mensagem; o painel avisa o atendente
    res.json({ ok: true, mensagemEnviada: enviada });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;