const Anthropic = require("@anthropic-ai/sdk");
const { registrarUsoLlm } = require("./usoLlmService");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOME_TOOL_CLASSIFICAR = "classificar_e_atualizar_contexto";
const NOME_TOOL_ENCAMINHAR = "encaminhar_atendimento_humano";
const NOME_TOOL_CONTEXTO = "atualizar_contexto";
const NOME_TOOL_ENCERRAR = "encerrar_atendimento";

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

    // a API exige que a conversa termine com o cliente; mensagens do bot depois da última fala dele ficam de fora
    if (turnos.length && turnos[turnos.length - 1].role !== "user") {
        console.warn("[LLM] histórico terminava com o bot:", historico.map((msg) => msg.remetente).join(" > "));
        while (turnos.length && turnos[turnos.length - 1].role !== "user") {
            turnos.pop();
        }
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
        "\nIMPORTANTE: sempre escreva a mensagem para o cliente em texto. Além dela, chame a tool 'atualizar_contexto' com um resumo curto (até 2 frases) do atendimento até agora, incluindo esta mensagem.",
        "\nQuando a conversa terminar (o cliente se despediu, agradeceu sem fazer novo pedido ou disse que não precisa de mais nada), responda com uma despedida curta e chame a tool 'encerrar_atendimento'.",
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
        {
            name: NOME_TOOL_ENCERRAR,
            description: "Encerra o atendimento quando a conversa terminou. Use sempre junto com uma mensagem de despedida. Não use se houver orçamento em coleta, dúvida sem resposta ou reclamação, nem na mesma resposta em que encaminhar para atendente humano. Na dúvida se o cliente terminou, não encerre: pergunte se pode ajudar em algo mais.",
            input_schema: {
                type: "object",
                properties: {
                    motivo: {
                        type: "string",
                        enum: ["resolvido", "fora_do_escopo"],
                        description: "resolvido: o pedido ou a dúvida do cliente foi atendido. fora_do_escopo: o cliente só pediu coisas que a empresa não atende.",
                    },
                },
                required: ["motivo"],
            },
        },
    ];

    try {
            let conversa = mensagens;
    let texto = "";
    let encaminhamento = null;
    let encerramento = null;
    let contexto = null;

    try {
        // no máximo duas rodadas: se o modelo só chamou ferramentas, devolve o resultado e pede a mensagem
        for (let rodada = 0; rodada < 2; rodada++) {
            const resposta = await client.messages.create({
                model: modelo,
                max_tokens: 1024,
                system: systemPrompt,
                messages: conversa,
                tools,
                tool_choice: { type: "auto" },
            });

            await registrarUsoLlm(empresaId, chamadoId, "agente", modelo, resposta.usage);

            for (const bloco of resposta.content) {
                if (bloco.type === "text") {
                    texto += bloco.text;
                } else if (bloco.type === "tool_use" && bloco.name === NOME_TOOL_ENCAMINHAR) {
                    encaminhamento = {
                        nomeCliente: bloco.input.nome_cliente,
                        motivo: bloco.input.motivo,
                        informacoes: bloco.input.informacoes,
                    };
                } else if (bloco.type === "tool_use" && bloco.name === NOME_TOOL_ENCERRAR) {
                    encerramento = { motivo: bloco.input.motivo };
                } else if (bloco.type === "tool_use" && bloco.name === NOME_TOOL_CONTEXTO) {
                    contexto = bloco.input.resumo_contexto;
                }
            }

            if (resposta.stop_reason === "max_tokens") {
                console.warn("[Agente] resposta cortada pelo limite de tokens");
            }

            const soFerramentas = !texto.trim() && !encaminhamento && !encerramento && resposta.stop_reason === "tool_use";
            if (!soFerramentas) break;

            console.warn("[Agente] o modelo só chamou ferramentas; pedindo a mensagem para o cliente");
            conversa = [
                ...conversa,
                { role: "assistant", content: resposta.content },
                {
                    role: "user",
                    content: resposta.content
                        .filter((bloco) => bloco.type === "tool_use")
                        .map((bloco) => ({ type: "tool_result", tool_use_id: bloco.id, content: "ok" })),
                },
            ];
        }

        if (encaminhamento) encerramento = null; // encaminhar sempre ganha

        if (!texto.trim() && !encaminhamento && !encerramento) {
            console.warn("[Agente] resposta sem texto e sem ação");
            return null;
        }

        return { texto: texto.trim(), encaminhamento, encerramento, contexto };
    } catch (erro) {
        console.error("Erro ao chamar a LLM como agente: ", erro.status || "", erro.message);
        return null;
    }
    } catch (erro) {
        console.error("Erro ao chamar a LLM como agente: ", erro.message);
        return null;
    }
}

module.exports = { montarMensagens, classificarComLLM, responderComoAgente };