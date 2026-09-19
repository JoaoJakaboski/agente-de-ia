const { supabase } = require("../db/client");

async function registrarMensagem(chamadoId, empresaId, remetente, conteudo) {
    const { error } = await supabase.from("mensagens").insert({
        chamado_id: chamadoId,
        empresa_id: empresaId,
        remetente,
        conteudo,
    });

    if (error) console.error("Erro ao registrar mensagem: ", error);
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

module.exports = { registrarMensagem, buscarHistorico };