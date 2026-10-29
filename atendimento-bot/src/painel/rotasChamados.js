const express = require("express");
const { exigirSessao } = require("./sessao");

const router = express.Router();
router.use(exigirSessao);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANHO_PAGINA = 30;
const LIMITE_MAXIMO = 200;
const MENSAGENS_POR_PAGINA = 50;

function inteiroEntre(valor, padrao, minimo, maximo) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? Math.min(Math.max(numero, minimo), maximo) : padrao;
}

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
// para que vírgulas e parênteses não alterem o filtro.
// O NFD separa o acento da letra ("ã" vira "a" + "~"), e o replace descarta o acento;
// a coluna "busca" da view já vem sem acento e em minúsculas
function filtroBusca(textoBruto) {
  const texto = String(textoBruto || "").slice(0, 60);
  const termo = texto.normalize("NFD").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();
  const digitos = texto.replace(/\D/g, "");

  const partes = [];
  if (termo) partes.push(`busca.ilike.%${termo}%`);
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

    const limite = inteiroEntre(req.query.limite, TAMANHO_PAGINA, 1, LIMITE_MAXIMO);
    const deslocamento = inteiroEntre(req.query.deslocamento, 0, 0, 100000);

    // desempate pelo id: a mesma ordem em todas as páginas
    // e um item a mais, só para saber se existe próxima página
    const linhas = verificar(
      await consulta.order("id", { ascending: true }).range(deslocamento, deslocamento + limite)
    );

    res.json({ chamados: linhas.slice(0, limite), temMais: linhas.length > limite });
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

    const [aguardando, meus, bot] = await Promise.all([
      contar((q) => q.eq("status", "aguardando_humano")),
      contar((q) => q.eq("status", "em_atendimento_humano").eq("atendente_id", req.usuario.id)),
      contar((q) => q.in("status", ["bot", "agente"])),
    ]);

    res.json({ aguardando, meus, bot });
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

    // ?antes=<data>: página anterior à mensagem mais antiga que o painel já tem
    const antes = req.query.antes && !Number.isNaN(Date.parse(req.query.antes))
      ? new Date(req.query.antes).toISOString()
      : null;

    let consultaMensagens = req.db
      .from("mensagens")
      .select("id, remetente, conteudo, atendente_id, criado_em")
      .eq("chamado_id", id)
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(MENSAGENS_POR_PAGINA + 1);
    if (antes) consultaMensagens = consultaMensagens.lt("criado_em", antes);

    const linhas = verificar(await consultaMensagens);
    const temMais = linhas.length > MENSAGENS_POR_PAGINA;
    const mensagens = linhas.slice(0, MENSAGENS_POR_PAGINA).reverse();

    // eventos do mesmo intervalo de tempo da página
    let consultaEventos = req.db
      .from("eventos_chamado")
      .select("id, status_anterior, status_novo, atendente_id, motivo, criado_em")
      .eq("chamado_id", id)
      .order("criado_em", { ascending: true });
    if (temMais && mensagens.length) consultaEventos = consultaEventos.gte("criado_em", mensagens[0].criado_em);
    if (antes) consultaEventos = consultaEventos.lt("criado_em", antes);
    const eventos = verificar(await consultaEventos);

    const ids = [...new Set([...mensagens, ...eventos].map((item) => item.atendente_id).filter(Boolean))];
    const pessoas = ids.length ? verificar(await req.db.from("usuarios").select("id, nome").in("id", ids)) : [];
    const nomePorId = Object.fromEntries(pessoas.map((pessoa) => [pessoa.id, pessoa.nome]));

    res.json({
      mensagens: mensagens.map((m) => ({ ...m, atendente_nome: nomePorId[m.atendente_id] || null })),
      eventos: eventos.map((e) => ({ ...e, atendente_nome: nomePorId[e.atendente_id] || null })),
      temMais,
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;