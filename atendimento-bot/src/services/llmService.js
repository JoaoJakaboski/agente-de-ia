const Anthropic = require("@anthropic-ai/sdk");
const { registrarUsoLlm } = require("./usoLlmService");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOME_TOOL_CLASSIFICAR = "classificar_e_atualizar_contexto";
const NOME_TOOL_ENCAMINHAR = "encaminhar_atendimento_humano";
const NOME_TOOL_CONTEXTO = "atualizar_contexto";

function montarMensagens(historico) {
    const turnos = [];

    for (const msg of historico) {
        const role = msg.remetente === "cliente" ? "user" : "assistant";
        const ultimo = turnos[turnos.length - 1];

        if (ultimo && ultimo.role === role) {
            ultimo.content += `\n${msg.conteudo}`;
        } else {
            turnos.push({ role, content: msg.conteudo });
        }
    }

    while (turnos.length && turnos[0].role !== "user") {
        turnos.shift();
    }

    return turnos;
}

async function classificarComLLM({ modelo, empresaId, chamadoId, contextoAtual, historico, intencoesDisponiveis }) {
    const mensagens = montarMensagens(historico);
    if (mensagens.length === 0) return null;

     const listaFormatada = intencoesDisponiveis
    .map((item) => `- ${item.intencao}: ${item.descricao || "(sem descrição cadastrada)"}`)
    .join("\n");

    const systemPrompt = [
    "Você é um classificador de intenções para o atendimento via WhatsApp de uma empresa.",
    "Analise a última mensagem do cliente considerando o histórico da conversa e identifique a intenção mais provável.",
    contextoAtual ? `Resumo do atendimento até agora: ${contextoAtual}` : null,
    ].filter(Boolean).join("\n");

     const tool = {
        name: NOME_TOOL_CLASSIFICAR,
        description: "Classifica a intenção da última mensagem do cliente e atualiza o resumo do atendimento.",
        input_schema: {
        type: "object",
        properties: {
            intencao: {
            type: "string",
            enum: [...intencoesDisponiveis.map((i) => i.intencao), "nenhuma"],
            description: `A intenção que melhor descreve a última mensagem do cliente. Opções disponíveis:\n${listaFormatada}\nUse "nenhuma" se não se encaixar em nenhuma delas.`,
            },
            resumo_contexto: {
            type: "string",
            description: "Resumo curto (até 2 frases) do atendimento até agora, incluindo esta mensagem.",
            },
        },
        required: ["intencao", "resumo_contexto"],
        },
    };

    try {
        const resposta = await client.messages.create({
            model: modelo,
            max_tokens: 300,
            system: systemPrompt,
            messages: mensagens,
            tools: [tool],
            tool_choice: { type: "tool", name: NOME_TOOL_CLASSIFICAR },  
        })

        await registrarUsoLlm(empresaId, chamadoId, "classificadora", modelo, resposta.usage);

        const blocoTool = resposta.content.find((bloco) => bloco.type === "tool_use");
        if (!blocoTool) return null;

        return {
            intencao: blocoTool.input.intencao,
            contexto: blocoTool.input.resumo_contexto,
        };
    } catch (erro) {
        console.error("Erro ao classifciar com a LLM: ", erro.message);
        return null;
    }
}

async function responderComoAgente({ modelo, empresaId, chamadoId, systemPromptEmpresa, contextoAtual, historico }) {
    const mensagens = montarMensagens(historico);
    if (mensagens.length === 0) return null;

    const systemPrompt = [
        systemPromptEmpresa,
        contextoAtual ? `\nResumo do atendimento até agora: ${contextoAtual}` : null,
        "\nIMPORTANTE: a cada resposta, chame também a tool 'atualizar_contexto' com um resumo curto (até 2 frases) do atendimento até agora, incluindo esta mensagem.",
    ].filter(Boolean).join("\n");

    const tools = [
        {
            name: NOME_TOOL_ENCAMINHAR,
            description: "Encaminha o atendimento para um atendente humano quando o orçamento está completo, há dúvida que vocÇe não sabe responder, ou uma reclamação/situação sensível.",
            input_schema: {
                type: "object",
                properties: {
                    nome_cliente: { type: "string", description: "Nome do cliente, ou 'Não informado' se ele não quis informar." },
                    motivo: { type: "string", enum: ["orcamento", "duvida_nao_respondida", "reclamacao"] },
                    informacoes: { type: "string", description: "Resumo claro e completo do que foi coletado ou da dúvida que ficou pendente." },
                },
                required: ["nome_cliente", "motivo", "informacoes"],
            },
        },
        {
            name: NOME_TOOL_CONTEXTO,
            description: "Atualiza o resumo do atendimento até agora.",
            input_schema: {
                type: "object",
                properties: {
                    resumo_contexto: {
                        type: "string",
                        description: "Resumo curto (até 2 frases) do atendimento até agora, incluindo esta mensagem.",
                    },
                },
                required: ["resumo_contexto"],
            },
        },
    ];

    try {
        const resposta = await client.messages.create({
            model: modelo,
            max_tokens: 500,
            system: systemPrompt,
            messages: mensagens,
            tools,
            tool_choice: { type: "auto" },
        });

        await registrarUsoLlm(empresaId, chamadoId, "agente", modelo, resposta.usage);

        let texto = "";
        let encaminhamento = null;
        let contexto = null;

        for (const bloco of resposta.content) {
            if (bloco.type === "text") {
                texto += bloco.text;
            } else if (bloco.type === "tool_use" && bloco.name === NOME_TOOL_ENCAMINHAR) {
                encaminhamento = {
                    nomeCliente: bloco.input.nome_cliente,
                    motivo: bloco.input.motivo,
                    informacoes: bloco.input.informacoes,
                };
            } else if (bloco.type === "tool_use" && bloco.name === NOME_TOOL_CONTEXTO) {
                contexto = bloco.input.resumo_contexto;
            }
        }

        if (!texto && !encaminhamento) return null;

        return { texto: texto.trim(), encaminhamento, contexto };
    } catch (erro) {
        console.error("Erro ao chamar a LLM como agente: ", erro.message);
        return null;
    }
}

module.exports = { montarMensagens, classificarComLLM, responderComoAgente };