const { supabase } = require("../db/client");

const SEGUNDOS_DEBOUNCE_PADRAO = Number(process.env.DEBOUNCE_SECONDS_DEFAULT || 7);

// cache simples em memória pra não bater no banco a cada mensagem
const CACHE_TTL_MS = 60 * 1000;
const cacheEmpresas = new Map();

async function buscarEmpresaPorInstancia(instanciaEvolution) {
  const cacheado = cacheEmpresas.get(instanciaEvolution);
  if (cacheado && cacheado.expiraEm > Date.now()) {
    return cacheado.empresa;
  }

  const { data, error } = await supabase
    .from("empresas")
    .select("*, configuracoes_agente(*)")
    .eq("instancia_evolution", instanciaEvolution)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar empresa:", error);
    return null;
  }
  cacheEmpresas.set(instanciaEvolution, { empresa: data, expiraEm: Date.now() + CACHE_TTL_MS });
  return data;
}

function segundosDebounceDaEmpresa(empresa) {
  const config = empresa && empresa.configuracoes_agente;
  const configuracao = Array.isArray(config) ? config[0] : config;
  return (configuracao && configuracao.segundos_debounce) || SEGUNDOS_DEBOUNCE_PADRAO;
}

module.exports = { buscarEmpresaPorInstancia, segundosDebounceDaEmpresa };
