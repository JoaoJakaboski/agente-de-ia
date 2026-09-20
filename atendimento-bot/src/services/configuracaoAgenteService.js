const { supabase } = require("../db/cliente");

const HORAS_INATIVIDADE_PADRAO = Number(process.env.HORAS_INATIVIDADE_CHAMADO || 24);
const CACHE_TTL_MS = 60 * 1000;
const cacheConfiguracoes = new Map();

async function buscarConfiguracaoAgente(empresaId) {
    const cacheado = cacheConfiguracoes.get(empresaId);
    if (cacheado && cacheado.expiraEm > Date.now()) return cacheado.configuracao;

    const { data, error } = await supabase
        .from("configuracoes_agente")
        .select("system_prompt, modelo, limiar_faq, horas_inatividade_chamado")
        .eq("empresa_id", empresaId)
        .maybeSingle();
    
    if (error) {
        console.error("Erro ao buscar configuração do agente: ", error);
        return null;
    }

    cacheConfiguracoes.set(empresaId, { configuracao: data, exipraEm: Date.now() + CACHE_TTL_MS});
    return data;
}

function horasInatividadeDaConfiguracao(configuracao) {
    return (configuracao && configuracao.horas_inatividade_chamado) || HORAS_INATIVIDADE_PADRAO;
}

module.exports = { buscarConfiguracaoAgente, horasInatividadeDaConfiguracao };