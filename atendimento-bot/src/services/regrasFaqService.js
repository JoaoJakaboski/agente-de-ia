const { supabase } = require("../db/client");

// cache em memória: empresaId -> { regras: { intencao: resposta }, expiraEm }
const CACHE_TTL_MS = 60 * 1000;
const cacheRegras = new Map();
const INTENCOES_INTERNAS = ["saudacao_continuidade"];

async function carregarRegras(empresaId) {
  const cacheado = cacheRegras.get(empresaId);
  if (cacheado && cacheado.expiraEm > Date.now()) {
    return cacheado.regras;
  }

  const { data, error } = await supabase
    .from("regras_faq")
    .select("intencao, resposta, escalar_humano, descricao_intencao, inicia_agente")
    .eq("empresa_id", empresaId)
    .eq("ativo", true);

  if (error) {
    console.error("Erro ao buscar regras de faq:", error);
    return {};
  }

  const regras = {};
  for (const linha of data) {
    regras[linha.intencao] = { 
      resposta: linha.resposta,
      escalarHumano: linha.escalar_humano,
      descricao: linha.descricao_intencao,
      iniciaAgente: linha.inicia_agente,
    };
  }

  cacheRegras.set(empresaId, { regras, expiraEm: Date.now() + CACHE_TTL_MS });
  return regras;
}

async function respostaPorIntencao(empresaId, intencao) {
  const regras = await carregarRegras(empresaId);
  return regras[intencao] || null;
}

async function listarIntencoesClassificaveis(empresaId) {
  const regras = await carregarRegras(empresaId);
  return Object.entries(regras)
    .filter(([intencao]) => !INTENCOES_INTERNAS.includes(intencao))
    .map(([intencao, dados]) => ({ intencao, descricao: dados.descricao || "" }));
}

module.exports = { respostaPorIntencao, listarIntencoesClassificaveis };