const { supabase } = require('../db/client');

// reaproveita um chamado já aberto pro mesmo cliente, ou cria um novo
async function abrirOuAtualizarChamado(empresaId, telefoneCliente, assunto) {
    const { data: existente, error: erroConsulta } = await supabase
        .from("chamados")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("telefone_cliente", telefoneCliente)
        .eq("status", "encerrado")
        .maybeSingle();

    if (erroConsulta) {
        console.error("Erro ao consultar chamado existente:", erroConsulta);
        return;
    }

    if (existente) {
        const { error } = await supabase
            .from("chamados")
            .update({ status: "aguardando_humano", assunto, atualizado_em: new Date().toISOString() })
            .eq("id", existente.id);

        if (error) console.error("Erro ao criar atualizar chamado: ", error);    
    }

    const  { error } = await supabase
        .from("chamados")
        .insert({
            empresa_id: empresaId,
            telefone_cliente: telefoneCliente,
            assunto,
            status: "aguardando_humano",
        });

    if (error) console.error("Erro ao criar chamado: ", error);
}

module.exports = { abrirOuAtualizarChamado };