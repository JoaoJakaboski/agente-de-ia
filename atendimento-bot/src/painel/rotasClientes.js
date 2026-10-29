const express = require("express");
const { supabase } = require("../db/client");
const { exigirSessao } = require("./sessao");
const { UUID, agora, primeiroNome, limparNome, instanciaDaEmpresa } = require("./comum");
const { enviarMensagemWhatsapp, numeroNoWhatsapp } = require("../services/evolutionService");
const { registrarMensagem } = require("../services/mensagensService");

const router = express.Router();
router.use(exigirSessao);

const TAMANHO_PAGINA = 30;
const LIMITE_MAXIMO = 200;
const LIMITE_TEXTO = 4000;
const CAMPOS = "id, nome, telefone, criado_em, total_chamados, ultimo_chamado_em, chamado_aberto_id, chamado_aberto_status";

function inteiroEntre(valor, padrao, minimo, maximo) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? Math.min(Math.max(numero, minimo), maximo) : padrao;
}

function verificar({ data, error }) {
  if (error) throw error;
  return data;
}

// aceita com ou sem +55, espaços e traços; DDD + número sem o país ganha o 55
function normalizarTelefone(valor) {
  if (typeof valor !== "string") return null;
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return digitos.length >= 12 && digitos.length <= 15 ? digitos : null;
}

// mesmo cuidado da busca de chamados: só letras, números e espaço entram no filtro
function filtroBusca(textoBruto) {
  const texto = String(textoBruto || "").slice(0, 60);
  const termo = texto.normalize("NFD").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();
  const digitos = texto.replace(/\D/g, "");

  const partes = [];
  if (termo) partes.push(`busca.ilike.%${termo}%`);
  if (digitos.length >= 3) partes.push(`telefone.ilike.%${digitos}%`);
  return partes.join(",");
}

// lido com o token do atendente: se a RLS não devolver, o cliente não é da empresa dele
async function carregarCliente(req, res) {
  const { id } = req.params;
  if (!UUID.test(id)) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }

  const cliente = verificar(
    await req.db.from("clientes").select("id, empresa_id, nome, telefone").eq("id", id).maybeSingle()
  );
  if (!cliente) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }
  return cliente;
}

router.get("/", async (req, res, next) => {
  try {
    let consulta = req.db.from("clientes_lista").select(CAMPOS);

    const filtro = filtroBusca(req.query.busca);
    if (filtro) consulta = consulta.or(filtro);

    const limite = inteiroEntre(req.query.limite, TAMANHO_PAGINA, 1, LIMITE_MAXIMO);
    const deslocamento = inteiroEntre(req.query.deslocamento, 0, 0, 100000);

    // quem falou por último primeiro; o id desempata para a ordem ser a mesma em todas as páginas
    const linhas = verificar(
      await consulta
        .order("ultimo_chamado_em", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(deslocamento, deslocamento + limite)
    );

    res.json({ clientes: linhas.slice(0, limite), temMais: linhas.length > limite });
  } catch (erro) {
    next(erro);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const nome = limparNome(req.body.nome);
    const telefone = normalizarTelefone(req.body.telefone);
    if (nome === undefined || !telefone) return res.status(400).json({ erro: "dados_invalidos" });

    // grava o número como o WhatsApp o identifica: é assim que ele chega pelo webhook
    const instancia = await instanciaDaEmpresa(req.usuario.empresaId);
    const verificacao = await numeroNoWhatsapp(instancia, telefone);
    if (verificacao.erro) return res.status(502).json({ erro: "falha_verificacao" });
    if (!verificacao.existe) return res.status(400).json({ erro: "sem_whatsapp" });

    const { data, error } = await supabase
      .from("clientes")
      .insert({ empresa_id: req.usuario.empresaId, telefone: verificacao.telefone, nome })
      .select("id, nome, telefone")
      .single();

    if (error && error.code === "23505") return res.status(409).json({ erro: "cliente_existente" });
    if (error) throw error;

    res.status(201).json({ cliente: data });
  } catch (erro) {
    next(erro);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const nome = limparNome(req.body.nome);
    if (nome === undefined) return res.status(400).json({ erro: "dados_invalidos" });

    const cliente = await carregarCliente(req, res);
    if (!cliente) return;

    const momento = agora();
    verificar(await supabase.from("clientes").update({ nome, atualizado_em: momento }).eq("id", cliente.id).select("id"));

    // o tempo real escuta "chamados": tocar os abertos desse cliente atualiza os outros painéis
    await supabase
      .from("chamados")
      .update({ atualizado_em: momento })
      .eq("cliente_id", cliente.id)
      .neq("status", "encerrado");

    res.json({ cliente: { id: cliente.id, nome, telefone: cliente.telefone } });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/conversa", async (req, res, next) => {
  try {
    const texto = typeof req.body.texto === "string" ? req.body.texto.trim() : "";
    if (!texto || texto.length > LIMITE_TEXTO) return res.status(400).json({ erro: "dados_invalidos" });

    const cliente = await carregarCliente(req, res);
    if (!cliente) return;

    // o chamado nasce com o atendente: quando o cliente responder, o bot não entra na conversa.
    // O índice único barra um segundo chamado aberto, mesmo com dois cliques ao mesmo tempo
    const { data: chamado, error } = await supabase
      .from("chamados")
      .insert({
        empresa_id: cliente.empresa_id,
        cliente_id: cliente.id,
        telefone_cliente: cliente.telefone,
        status: "em_atendimento_humano",
        atendente_id: req.usuario.id,
        assunto: "iniciado_pelo_painel",
      })
      .select("id")
      .single();

    if (error && error.code === "23505") return res.status(409).json({ erro: "chamado_aberto" });
    if (error) throw error;

    const instancia = await instanciaDaEmpresa(cliente.empresa_id);
    const enviada = await enviarMensagemWhatsapp(instancia, cliente.telefone, `*${primeiroNome(req.usuario.nome)}:* ${texto}`);

    if (!enviada) {
      // não deixa um chamado aberto sem conversa nenhuma
      const momento = agora();
      await supabase
        .from("chamados")
        .update({
          status: "encerrado",
          motivo_encerramento: "outro",
          observacao_encerramento: "A primeira mensagem não chegou ao cliente.",
          encerrado_em: momento,
          atualizado_em: momento,
        })
        .eq("id", chamado.id);
      return res.status(502).json({ erro: "falha_envio" });
    }

    await registrarMensagem(chamado.id, cliente.empresa_id, "humano", texto, req.usuario.id);
    res.status(201).json({ chamadoId: chamado.id });
  } catch (erro) {
    next(erro);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (req.usuario.papel !== "admin") return res.status(403).json({ erro: "somente_admin" });

    const cliente = await carregarCliente(req, res);
    if (!cliente) return;

    const { data: resultado, error } = await supabase.rpc("excluir_cliente", {
      p_cliente_id: cliente.id,
      p_empresa_id: req.usuario.empresaId,
    });
    if (error) throw error;

    if (resultado === "chamado_aberto") return res.status(409).json({ erro: "chamado_aberto" });
    if (resultado !== "ok") return res.status(404).json({ erro: "nao_encontrado" });

    res.status(204).end();
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;