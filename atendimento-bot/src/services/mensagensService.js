const { supabase } = require("../db/client");
const { reagendarFechamentoAutomatico } = require("../queue/fechamentoQueue");
const { buscarConfiguracaoAgente, horasInatividadeDaConfiguracao } = require("./configuracaoAgenteService");

async function registrarMensagem(chamadoId, empresaId, remetente, conteudo) {
    const { error } = await supabase.from("mensagens").insert({
        chamado_id: chamadoId,
        empresa_id: empresaId,
        remetente,
        conteudo,
    });

    if (error) {
        console.error("Erro ao registrar mensagem: ", error);
        return;
    }

    const configuracao = await buscarConfiguracaoAgente(empresaId);
    const horas = horasInatividadeDaConfiguracao(configuracao);
    await reagendarFechamentoAutomatico(chamadoId, horas);
}

async function buscarHistorico(chamadoId) {
    const { data, error } = await supabase
        .from("mensagens")
        .select("remetente, conteudo, criado_em")
        .eq("chamado_id", chamadoId)
        .order("criado_em", { ascending: true });

    if (error) {
        console.error("Erro ao buscar histórico: ", error);
        return [];
    }

    return data;
}

async function buscarUltimasMensagens(chamadoId, limite = 5) {
    const { data, error } = await supabase
        .from("mensagens")
        .select("remetente, conteudo, criado_em")
        .eq("chamado_id", chamadoId)
        .order("criado_em", { ascending: false })
        .limit(limite);
    
    if (error) {
        console.error("Erro ao buscar últimas mensagens: ", error);
        return [];
    }

    return data.reverse();
}

module.exports = { registrarMensagem, buscarHistorico, buscarUltimasMensagens };