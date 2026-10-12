require("dotenv/config");
const { iniciarWorkerDebounce } = require("./queue/debounceWorker");
const { iniciarWorkerFechamento } = require("./queue/fechamentoWorker");
const { classificarIntencao } = require("./services/classificadorService");
const { respostaPorIntencao, listarIntencoesClassificaveis } = require("./services/regrasFaqService");
const { enviarMensagemWhatsapp } = require("./services/evolutionService");
const { atualizarStatusChamado, buscarContexto, atualizarContexto, atualizarNomeCliente, buscarEstadoChamado } = require("./services/chamadoService");
const { registrarMensagem, buscarUltimasMensagens } = require("./services/mensagensService");
const { classificarComLLM, responderComoAgente } = require("./services/llmService")
require("./webhookServer");

const LIMIAR_CONFIANCA_PADRAO = Number(process.env.LIMIAR_CONFIANCA_DEFAULT || 0.8);
const MODELO_PADRAO = "claude-haiku-4-5-20251001";

async function processarMensagemAgregada(empresaId, empresaSlug, instanciaEvolution, chamadoId, telefone, textoCombinado, config, mensagemInicial, contemMidia) {
  const limiar = (config && config.limiar_faq) || LIMIAR_CONFIANCA_PADRAO;
  const modelo = (config && config.modelo) || MODELO_PADRAO;
  const systemPromptEmpresa = config && config.system_prompt;

  const { contexto: contextoAtual, status: statusAtual } = await buscarEstadoChamado(chamadoId);

  // a equipe assumiu enquanto as mensagens esperavam no debounce: o bot não responde mais
  if (["aguardando_humano", "em_atendimento_humano", "encerrado"].includes(statusAtual)) {
    console.log(`[Funil] chamado ${chamadoId} não está mais com o bot (${statusAtual}); resposta cancelada`);
    return;
  }
  
  const pularClassificacao = contemMidia || statusAtual === "agente";

  // camada 1: ML classificador
  if (!pularClassificacao) {
    const resultado = await classificarIntencao(empresaSlug, textoCombinado);
    console.log("[Classificador] ", resultado);
    
    if (resultado && resultado.confianca >= limiar) {
      if (await tratarSaudacao(resultado.intencao, { chamadoId, empresaId, instanciaEvolution, telefone, mensagemInicial })) return;
  
      const regra = await respostaPorIntencao(empresaId, resultado.intencao);
      if (regra) {
        console.log(`[Regra] ${resultado.intencao} (${resultado.confianca.toFixed(2)})`);
        await enviarMensagemWhatsapp(instanciaEvolution, telefone, regra.resposta);
        await registrarMensagem(chamadoId, empresaId, "bot", regra.resposta);
  
        if (regra.escalarHumano) {
          await atualizarStatusChamado(chamadoId, "aguardando_humano", resultado.intencao);
          console.log(`[Chamado escalado - humano] ${resultado.intencao}`);
        } else if (regra.iniciaAgente) {
          await atualizarStatusChamado(chamadoId, "agente", resultado.intencao);
          console.log(`[Chamado escalado - camada 3] ${resultado.intencao}`)
        }
        return;
      }
    } 
  }

  // ML não bateu confiança (ou não tinha regra) -> tenta a LLM como classificadora
  // camada 2: LLM como classificador
  const historico = await buscarUltimasMensagens(chamadoId, 5);

  if (!pularClassificacao) {
    const intencoesDisponiveis = await listarIntencoesClassificaveis(empresaId);
  
    const resultadoLLM = await classificarComLLM({
      modelo,
      empresaId,
      chamadoId,
      contextoAtual,
      historico,
      intencoesDisponiveis,
    });
  
    if (resultadoLLM) {
      await atualizarContexto(chamadoId, resultadoLLM.contexto);
      
      if (await tratarSaudacao(resultadoLLM.intencao, { chamadoId, empresaId, instanciaEvolution, telefone, mensagemInicial })) return;
  
      if (resultadoLLM.intencao !== "nenhuma") {
        const regra = await respostaPorIntencao(empresaId, resultadoLLM.intencao);
        if (regra) {
          console.log(`[Camada 2] ${resultadoLLM.intencao}`);
          await enviarMensagemWhatsapp(instanciaEvolution, telefone, regra.resposta);
          await registrarMensagem(chamadoId, empresaId, "bot", regra.resposta);
  
          if (regra.escalarHumano) {
            await atualizarStatusChamado(chamadoId, "aguardando_humano", resultadoLLM.intencao);
            console.log(`[Chamado escalado via LLM - humano] ${resultadoLLM.intencao}`);
          } else if (regra.iniciaAgente) {
            await atualizarStatusChamado(chamadoId, "agente", resultadoLLM.intencao);
            console.log(`[Chamado escalado via LLM - camada 3] ${resultadoLLM.intencao}`)
          }
          return;
        }
      }
    }
  }

  // camada 3 (agente LLM sem FAQ)
  const resposta = await responderComoAgente({
    modelo,
    empresaId,
    chamadoId,
    systemPromptEmpresa,
    contextoAtual,
    historico,
  });

  if (!resposta) {
    const mensagemErro = "Desculpa, tive um problema aqui agora - já vou te encaminhar para alguém da nossa equipe. 🙏";
    await enviarMensagemWhatsapp(instanciaEvolution, telefone, mensagemErro);
    await registrarMensagem(chamadoId, empresaId, "bot", mensagemErro);
    await atualizarStatusChamado(chamadoId, "aguardando_humano", "erro_llm");
    return;
  }

  if (resposta.contexto) await atualizarContexto(chamadoId, resposta.contexto);

  const textoResposta = resposta.texto || "Perfeito! Já registrei suas informações ✅. Nossa equipe vai te retornar em breve.";
  await enviarMensagemWhatsapp(instanciaEvolution, telefone, textoResposta);
  await registrarMensagem(chamadoId, empresaId, "bot", textoResposta);

  console.log(`[Camada 3] ${resposta.encaminhamento ? `encaminhou (${resposta.encaminhamento.motivo})` : "continua coletando informações"}`);

  if (resposta.encaminhamento) {
    // nome coletado pelo agente: o atendente passa a ver o nome em vez do telefone
    const nome = (resposta.encaminhamento.nomeCliente || "").trim();
    if (nome && nome.toLowerCase() !== "não informado") {
      await atualizarNomeCliente(chamadoId, nome.slice(0, 120));
    }
    await atualizarStatusChamado(chamadoId, "aguardando_humano", resposta.encaminhamento.motivo);
  } else if (statusAtual !== "agente") {
    await atualizarStatusChamado(chamadoId, "agente");
  }
}

async function tratarSaudacao(intencao, { chamadoId, empresaId, instanciaEvolution, telefone, mensagemInicial }) {
  if (intencao !== "saudacao") return false;

  const regra = await respostaPorIntencao(empresaId, mensagemInicial ? "saudacao" : "saudacao_continuidade");

  if (regra) {
    await enviarMensagemWhatsapp(instanciaEvolution, telefone, regra.resposta);
    await registrarMensagem(chamadoId, empresaId, "bot", regra.resposta);
  }
  return true;
}

iniciarWorkerDebounce(processarMensagemAgregada);
iniciarWorkerFechamento();
console.log("Workers rodando (debounce + fechamento automático)");