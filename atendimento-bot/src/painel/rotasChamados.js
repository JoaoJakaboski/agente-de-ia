const express = require("express");
const { exigirSessao } = require("./sessao");

const router = express.Router();
router.use(exigirSessao);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_LISTA = 100;
const LIMITE_MENSAGENS = 500;

const CAMPOS_LISTA = [
  "id", "nome_cliente", "telefone_cliente", "status", "assunto",
  "atendente_id", "atendente_nome", "motivo_encerramento",
  "criado_em", "atualizado_em", "encerrado_em",
  "ultima_mensagem", "ultima_mensagem_remetente", "ultima_mensagem_em", "status_desde",
  "observacao_encerramento",
].join(", ");

function aplicarFila(consulta, fila) {
  switch (fila) {
    case "aguardando":
      return consulta.eq("status", "aguardando_humano").order("status_desde", { ascending: true, nullsFirst: true });
    case "meus":
      // traz todos em atendimento; o painel separa os seus dos de outros atendentes
      return consulta.eq("status", "em_atendimento_humano").order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
    case "bot":
      return consulta.in("status", ["bot", "agente"]).order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
    case "encerrados":
      return consulta.eq("status", "encerrado").order("encerrado_em", { ascending: false, nullsFirst: false });
    default:
      return null;
  }
}

// o texto da busca entra num filtro do PostgREST: só letras, números e espaço,
// para que vírgulas e parênteses não alterem o filtro
function filtroBusca(textoBruto) {
  const texto = String(textoBruto || "").slice(0, 60);
  const termo = texto.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const digitos = texto.replace(/\D/g, "");

  const partes = [];
  if (termo) partes.push(`nome_cliente.ilike.%${termo}%`);
  if (digitos.length >= 3) partes.push(`telefone_cliente.ilike.%${digitos}%`);
  return partes.join(",");
}

function verificar({ data, error }) {
  if (error) throw error;
  return data;
}

async function chamadoVisivel(db, id) {
  const linha = verificar(await db.from("chamados").select("id").eq("id", id).maybeSingle());
  return Boolean(linha);
}

router.get("/", async (req, res, next) => {
  try {
    let consulta = aplicarFila(req.db.from("chamados_lista").select(CAMPOS_LISTA), req.query.fila);
    if (!consulta) return res.status(400).json({ erro: "fila_invalida" });

    const filtro = filtroBusca(req.query.busca);
    if (filtro) consulta = consulta.or(filtro);

    const chamados = verificar(await consulta.limit(LIMITE_LISTA));
    res.json({ chamados });
  } catch (erro) {
    next(erro);
  }
});

router.get("/contagens", async (req, res, next) => {
  try {
    const contar = async (aplicar) => {
      const { count, error } = await aplicar(req.db.from("chamados").select("id", { count: "exact", head: true }));
      if (error) throw error;
      return count || 0;
    };

    const [aguardando, meus, bot, encerrados] = await Promise.all([
      contar((q) => q.eq("status", "aguardando_humano")),
      contar((q) => q.eq("status", "em_atendimento_humano").eq("atendente_id", req.usuario.id)),
      contar((q) => q.in("status", ["bot", "agente"])),
      contar((q) => q.eq("status", "encerrado")),
    ]);

    res.json({ aguardando, meus, bot, encerrados });
  } catch (erro) {
    next(erro);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).json({ erro: "nao_encontrado" });

    const chamado = verificar(await req.db.from("chamados_lista").select(CAMPOS_LISTA).eq("id", id).maybeSingle());
    if (!chamado) return res.status(404).json({ erro: "nao_encontrado" });

    const [extra, usos, config] = await Promise.all([
      req.db.from("chamados").select("contexto").eq("id", id).maybeSingle().then(verificar),
      req.db.from("uso_llm").select("tokens_entrada, tokens_saida").eq("chamado_id", id).then(verificar),
      req.db.from("configuracoes_agente").select("horas_inatividade_chamado").maybeSingle().then(verificar),
    ]);

    const tokens = (usos || []).reduce(
      (soma, uso) => ({ entrada: soma.entrada + (uso.tokens_entrada || 0), saida: soma.saida + (uso.tokens_saida || 0) }),
      { entrada: 0, saida: 0 }
    );

    // o prazo reinicia a cada mensagem, então conta a partir da última
    const horas = config && Number(config.horas_inatividade_chamado);
    const comBot = chamado.status === "bot" || chamado.status === "agente";
    const encerramentoPrevistoEm = comBot && horas && chamado.ultima_mensagem_em
      ? new Date(Date.parse(chamado.ultima_mensagem_em) + horas * 60 * 60 * 1000).toISOString()
      : null;

    res.json({
      chamado: {
        ...chamado,
        contexto: extra && extra.contexto,
        tokens,
        horas_inatividade: horas || null,
        encerramento_previsto_em: encerramentoPrevistoEm,
      },
    });
  } catch (erro) {
    next(erro);
  }
});

router.get("/:id/mensagens", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id) || !(await chamadoVisivel(req.db, id))) {
      return res.status(404).json({ erro: "nao_encontrado" });
    }

    const [mensagens, eventos] = await Promise.all([
      req.db.from("mensagens")
        .select("id, remetente, conteudo, atendente_id, criado_em")
        .eq("chamado_id", id)
        .order("criado_em", { ascending: true })
        .limit(LIMITE_MENSAGENS)
        .then(verificar),
      req.db.from("eventos_chamado")
        .select("id, status_anterior, status_novo, atendente_id, motivo, criado_em")
        .eq("chamado_id", id)
        .order("criado_em", { ascending: true })
        .then(verificar),
    ]);

    // nomes dos atendentes citados nas mensagens e nos eventos
    const ids = [...new Set([...mensagens, ...eventos].map((item) => item.atendente_id).filter(Boolean))];
    const pessoas = ids.length
      ? verificar(await req.db.from("usuarios").select("id, nome").in("id", ids))
      : [];
    const nomePorId = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));

    res.json({
      mensagens: mensagens.map((m) => ({ ...m, atendente_nome: nomePorId[m.atendente_id] || null })),
      eventos: eventos.map((e) => ({ ...e, atendente_nome: nomePorId[e.atendente_id] || null })),
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;