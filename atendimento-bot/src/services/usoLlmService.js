const { supabase } = require("../db/client");

async function registrarUsoLlm(empresaId, chamadoId, camada, modelo, usage) {
    if (!usage) return;

    const { error } = await supabase.from("uso_llm").insert({
        empresa_id: empresaId,
        chamado_id: chamadoId,
        camada,
        modelo,
        tokens_entrada: usage.input_tokens || 0,
        tokens_saida: usage.output_tokens || 0,
    });

    if (error) console.error("Erro ao registrar uso da LLm: ". error);
}

module.exports = { registrarUsoLlm };