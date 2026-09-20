const { supabase } = require('../db/client');
const { enviarMensagemWhatsapp } = require("./evolutionService");

async function garantirChamado(empresaId, telefoneCliente) {
    const { data: existente, error: erroConsulta } = await supabase
        .from("chamados")
        .select("id, status")
        .eq("empresa_id", empresaId)
        .eq("telefone_cliente", telefoneCliente)
        .neq("status", "encerrado")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (erroConsulta) {
        console.error("Erro ao consultar chamado existente: ", erroConsulta);
        return null;
    }

    if (existente) {
        return { id: existente.id, status: existente.status, isNovo: false };
    }

    const { data: novo, error: erroCriaco } = await supabase
        .from("chamados")
        .insert({ empresa_id: empresaId, telefone_cliente: telefoneCliente, status: "bot" })
        .select("id, status")
        .single();

    if (erroCriaco) {
        console.error("Erro ao criar chamado: ", erroCriaco);
        return null;
    }

    return { id: novo.id, status: novo.status, isNovo: true };
}

async function atualizarStatusChamado(chamadoId, status, assunto) {
    const dados = { status, atualizado_em: new Date().toISOString() };
    if (assunto) dados.assunto = assunto;

    const { error } = await supabase.from("chamados").update(dados).eq("id", chamadoId);
    if (error) console.error("Erro ao atualizar chamado: ", error);
}

async function fecharChamadoPorInatividade(chamadoId) {
    const { data: chamado, error: erroConsulta } = await supabase
        .from("chamados")
        .select("status, telefone_cliente, empresa_id, empresas(instancia_evolution)")
        .eq("id", chamadoId)
        .maybeSingle();

    if (erroConsulta || !chamado || chamado.status === "encerrado") return;

    const { error } = await supabase
        .from("chamados")
        .update({ status: "encerrado", motivo_encerramento: "inatividade", encerrado_em: new Date().toISOString() })
        .eq("id", chamadoId);
    
    if (error) { 
        console.error("Erro ao encerrar chamado por inatividade: ", error);
        return;
    }

    console.log(`[Chamado encerrado por inatividade] ${chamadoId}`);

    const instanciaEvolution = chamado.empresas && chamado.empresas.instancia_evolution;
    if (instanciaEvolution) {
        const mensagem = "Esse atendimento foi encerrado por inatividade. Se precisar de algo, é só mandar uma nova mensagem! 🙂"
        await enviarMensagemWhatsapp(instanciaEvolution, chamado.telefone_cliente, mensagem);

        const { error: erroLog } = await supabase.from("mensagens").insert({
            chamado_id: chamadoId,
            empresa_id: chamado.empresa_id,
            remetente: "bot",
            conteudo: mensagem,
        });

        if (erroLog) console.error("Erro ao registrar mensagem do encerramento: ", erroLog);
    }
}

async function buscarContexto(chamadoId) {
    const { data, error } = await supabase
        .from("chamados")
        .select("contexto")
        .eq("id", chamadoId)
        .maybeSingle();
    
    if (error) {
        console.error("Erro ao buscar contexto do chamado: ", error);
        return null;
    }
    return data ? data.contexto : null;
}

async function atualizarContexto(chamadoId, contexto) {
    const { error } = await supabase
        .from("chamados")
        .update({ contexto, atualizado_em: new Date().toISOString() })
        .eq("id", chamadoId);

    if (error) console.error("Erro ao atualizar contexto do chamado: ", error);
}

async function atualizarNomeCliente(chamadoId, nomeCliente) {
    const { error } = await supabase
        .from("chamados")
        .update({ nome_cliente: nomeCliente, atualizado_em: new Date().toISOString() })
        .eq("id", chamadoId);

    if (error) console.error("Erro ao atualizar nome do cliente: ", error);
}

module.exports = { garantirChamado, atualizarStatusChamado, fecharChamadoPorInatividade, buscarContexto, atualizarContexto, atualizarNomeCliente };