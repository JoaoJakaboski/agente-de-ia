const { supabase } = require('../db/client');
const { enviarMensagemWhatsapp } = require("./evolutionService");

// um cliente por telefone em cada empresa; cria na primeira mensagem
async function garantirCliente(empresaId, telefone) {
    const { error: erroCriacao } = await supabase
        .from("clientes")
        .upsert({ empresa_id: empresaId, telefone }, { onConflict: "empresa_id,telefone", ignoreDuplicates: true });

    if (erroCriacao) {
        console.error("Erro ao garantir cliente: ", erroCriacao);
        return null;
    }

    const { data, error } = await supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("telefone", telefone)
        .single();

    if (error) {
        console.error("Erro ao buscar cliente: ", error);
        return null;
    }
    return data.id;
}

async function garantirChamado(empresaId, telefoneCliente, tentativa=0) {
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

    const clienteId = await garantirCliente(empresaId, telefoneCliente);
    if (!clienteId) return null;

    const { data: novo, error: erroCriaco } = await supabase
        .from("chamados")
        .insert({ empresa_id: empresaId, cliente_id: clienteId, telefone_cliente: telefoneCliente, status: "bot" })
        .select("id, status")
        .single();

    if (erroCriaco) {
        // outra mensagem do mesmo número criou o chamado no mesmo instante: usa o dele
        if (erroCriaco.code === "23505" && tentativa === 0) {
            return garantirChamado(empresaId, telefoneCliente, 1);
        }
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

    if (erroConsulta || !chamado) return;
    if (!["bot", "agente"].includes(chamado.status)) return;

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

// o nome mora no cliente; o chamado só diz qual cliente é
async function atualizarNomeCliente(chamadoId, nomeCliente) {
    const { data: chamado, error: erroConsulta } = await supabase
        .from("chamados")
        .select("cliente_id")
        .eq("id", chamadoId)
        .maybeSingle();

    if (erroConsulta || !chamado) {
        console.error("Erro ao buscar cliente do chamado: ", erroConsulta);
        return;
    }

    const { error } = await supabase
        .from("clientes")
        .update({ nome: nomeCliente, atualizado_em: new Date().toISOString() })
        .eq("id", chamado.cliente_id)
        .is("nome", null);

    if (error) console.error("Erro ao atualizar nome do cliente: ", error);
}

async function buscarEstadoChamado(chamadoId) {
    const { data, error } = await supabase
        .from("chamados")
        .select("contexto, status")
        .eq("id", chamadoId)
        .single();
        
    if (error) {
        console.error("Erro ao buscar estado do chamado: ", error.message);
        return { contexto: null, status: "bot" };
    }

    return { contexto: data.contexto, status: data.status };
}

// encerra só se o chamado ainda está com o bot; se alguém assumiu no meio do caminho, não mexe
async function encerrarChamadoPeloBot(chamadoId, motivo) {
    const agora = new Date().toISOString();
    const { data, error } = await supabase
        .from("chamados")
        .update({ status: "encerrado", motivo_encerramento: motivo, encerrado_em: agora, atualizado_em: agora })
        .eq("id", chamadoId)
        .in("status", ["bot", "agente"])
        .select("id");

    if (error) {
        console.error("Erro ao encerrar chamado pelo bot: ", error);
        return false;
    }
    return data.length > 0;
}

module.exports = { 
    garantirChamado, 
    atualizarStatusChamado, 
    fecharChamadoPorInatividade, 
    buscarContexto, 
    atualizarContexto, 
    atualizarNomeCliente, 
    buscarEstadoChamado,
    encerrarChamadoPeloBot
};