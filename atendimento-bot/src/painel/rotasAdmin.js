const express = require("express");
const { exigirSessao } = require("./sessao");
const { limparCacheRegras, INTENCOES_INTERNAS } = require("../services/regrasFaqService");
const { limparCacheConfiguracao } = require("../services/configuracaoAgenteService");
const { limparCacheEmpresas } = require("../services/empresaService");

const router = express.Router();
router.use(exigirSessao);
router.use((req, res, next) => {
  if (req.usuario.papel !== "admin") return res.status(403).json({ erro: "somente_admin" });
  next();
});

const ID = /^[0-9a-zA-Z-]{1,64}$/;
const FORMATO_INTENCAO = /^[a-z0-9_]{2,60}$/;
const LIMITE_DESCRICAO = 500;
const LIMITE_RESPOSTA = 4000;
const LIMITE_PROMPT = 20000;

const MODELOS = [
  {
    id: "claude-haiku-4-5-20251001",
    nome: "Claude Haiku 4.5",
    descricao: "Mais rápido e econômico. Atende bem a maioria das conversas.",
  },
  {
    id: "claude-sonnet-5",
    nome: "Claude Sonnet 5",
    descricao: "Mais capaz em conversas longas e pedidos complexos, com custo maior por token.",
  },
];

const CAMPOS_REGRA = "id, intencao, descricao_intencao, resposta, ativo, escalar_humano, inicia_agente, criado_em";
const CAMPOS_AGENTE = "system_prompt, modelo, limiar_faq, segundos_debounce, horas_inatividade_chamado, ativo, atualizado_em";

function verificar({ data, error }) {
  if (error) throw error;
  return data;
}

function comMarcacao(regra) {
  return { ...regra, interna: INTENCOES_INTERNAS.includes(regra.intencao) };
}

// valida só os campos enviados (PATCH parcial); a resposta é obrigatória em regra nova
function validarRegra(corpo, nova) {
  const dados = {};

  if (nova) {
    const intencao = typeof corpo.intencao === "string" ? corpo.intencao.trim() : "";
    if (!FORMATO_INTENCAO.test(intencao)) return { erro: "intencao_invalida" };
    dados.intencao = intencao;
  }

  const textos = [
    ["descricao", "descricao_intencao", LIMITE_DESCRICAO, false],
    ["resposta", "resposta", LIMITE_RESPOSTA, true],
  ];
  for (const [campo, coluna, limite, obrigatorio] of textos) {
    if (corpo[campo] === undefined) {
      if (nova && obrigatorio) return { erro: "dados_invalidos" };
      continue;
    }
    if (typeof corpo[campo] !== "string") return { erro: "dados_invalidos" };
    const valor = corpo[campo].trim();
    if ((obrigatorio && !valor) || valor.length > limite) return { erro: "dados_invalidos" };
    dados[coluna] = valor || null;
  }

  const chaves = [["ativo", "ativo"], ["escalarHumano", "escalar_humano"], ["iniciaAgente", "inicia_agente"]];
  for (const [campo, coluna] of chaves) {
    if (corpo[campo] === undefined) continue;
    if (typeof corpo[campo] !== "boolean") return { erro: "dados_invalidos" };
    dados[coluna] = corpo[campo];
  }

  return { dados };
}

function numeroEntre(valor, minimo, maximo) {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= minimo && valor <= maximo;
}

router.get("/regras", async (req, res, next) => {
  try {
    const regras = verificar(await req.db.from("regras_faq").select(CAMPOS_REGRA).order("intencao"));
    res.json({ regras: regras.map(comMarcacao) });
  } catch (erro) {
    next(erro);
  }
});

router.post("/regras", async (req, res, next) => {
  try {
    const { dados, erro } = validarRegra(req.body || {}, true);
    if (erro) return res.status(400).json({ erro });

    const existente = verificar(
      await req.db.from("regras_faq").select("id").eq("intencao", dados.intencao).maybeSingle()
    );
    if (existente) return res.status(409).json({ erro: "intencao_duplicada" });

    const escalar = dados.escalar_humano ?? false;
    const regra = verificar(
      await req.db
        .from("regras_faq")
        .insert({
          ...dados,
          empresa_id: req.usuario.empresaId,
          ativo: dados.ativo ?? true,
          escalar_humano: escalar,
          // "escala para humano" tem prioridade: as duas nunca ficam ligadas juntas
          inicia_agente: escalar ? false : dados.inicia_agente ?? false,
        })
        .select(CAMPOS_REGRA)
        .single()
    );

    limparCacheRegras(req.usuario.empresaId);
    res.status(201).json({ regra: comMarcacao(regra) });
  } catch (erro) {
    next(erro);
  }
});

router.patch("/regras/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ID.test(id)) return res.status(404).json({ erro: "nao_encontrado" });

    const { dados, erro } = validarRegra(req.body || {}, false);
    if (erro) return res.status(400).json({ erro });
    if (Object.keys(dados).length === 0) return res.status(400).json({ erro: "dados_invalidos" });

    const atual = verificar(
      await req.db.from("regras_faq").select("escalar_humano").eq("id", id).maybeSingle()
    );
    if (!atual) return res.status(404).json({ erro: "nao_encontrado" });

    if (dados.escalar_humano ?? atual.escalar_humano) dados.inicia_agente = false;

    const regra = verificar(
      await req.db.from("regras_faq").update(dados).eq("id", id).select(CAMPOS_REGRA).single()
    );

    limparCacheRegras(req.usuario.empresaId);
    res.json({ regra: comMarcacao(regra) });
  } catch (erro) {
    next(erro);
  }
});

router.get("/agente", async (req, res, next) => {
  try {
    const configuracao = verificar(await req.db.from("configuracoes_agente").select(CAMPOS_AGENTE).maybeSingle());
    if (!configuracao) return res.status(404).json({ erro: "nao_encontrado" });
    res.json({ configuracao, modelos: MODELOS });
  } catch (erro) {
    next(erro);
  }
});

router.put("/agente", async (req, res, next) => {
  try {
    const corpo = req.body || {};
    const valido =
      typeof corpo.systemPrompt === "string" &&
      corpo.systemPrompt.trim().length > 0 &&
      corpo.systemPrompt.length <= LIMITE_PROMPT &&
      MODELOS.some((modelo) => modelo.id === corpo.modelo) &&
      numeroEntre(corpo.limiarFaq, 0, 1) &&
      Number.isInteger(corpo.segundosDebounce) &&
      numeroEntre(corpo.segundosDebounce, 1, 60) &&
      numeroEntre(corpo.horasInatividade, 0.05, 720) &&
      typeof corpo.ativo === "boolean";

    if (!valido) return res.status(400).json({ erro: "dados_invalidos" });

    const configuracao = verificar(
      await req.db
        .from("configuracoes_agente")
        .update({
          system_prompt: corpo.systemPrompt.trim(),
          modelo: corpo.modelo,
          limiar_faq: corpo.limiarFaq,
          segundos_debounce: corpo.segundosDebounce,
          horas_inatividade_chamado: corpo.horasInatividade,
          ativo: corpo.ativo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("empresa_id", req.usuario.empresaId)
        .select(CAMPOS_AGENTE)
        .single()
    );

    // o bot passa a usar a configuração nova já na próxima mensagem
    limparCacheConfiguracao(req.usuario.empresaId);
    limparCacheEmpresas();

    res.json({ configuracao, modelos: MODELOS });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;