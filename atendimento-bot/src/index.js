require("dotenv/config");
const { iniciarWorkerDebounce } = require("./queue/debounceWorker");
const { iniciarWorkerFechamento } = require("./queue/fechamentoWorker");
const { classificarIntencao } = require("./services/classificadorService");
const { respostaPorIntencao } = require("./services/regrasFaqService");
const { enviarMensagemWhatsapp } = require("./services/evolutionService");
const { atualizarStatusChamado } = require("./services/chamadoService");
const { registrarMensagem } = require("./services/mensagensService");
require("./webhookServer");

const LIMIAR_CONFIANCA_PADRAO = Number(process.env.LIMIAR_CONFIANCA_DEFAULT || 0.6);

async function processarMensagemAgregada(empresaId, empresaSlug, instanciaEvolution, chamadoId, telefone, textoCombinado) {
  const resultado = await classificarIntencao(empresaSlug, textoCombinado);
  
  if (resultado && resultado.confianca >= LIMIAR_CONFIANCA_PADRAO) {
    const regra = await respostaPorIntencao(empresaId, resultado.intencao);
    
    if (resultado.intencao === "saudacao") {
      console.log(`[Saudação ignorada] (${resultado.confianca.toFixed(2)})`);
      return;
    }
    
    if (regra) {
      console.log(`[Regra] ${resultado.intencao} (${resultado.confianca.toFixed(2)})`);
      await enviarMensagemWhatsapp(instanciaEvolution, telefone, regra.resposta);
      await registrarMensagem(chamadoId, empresaId, "bot", regra.resposta);
      
      if (regra.escalarHumano) {
        await atualizarStatusChamado(chamadoId, "aguardando_humano", resultado.intencao);
        console.log(`[Chamado escalado] ${resultado.intencao}`);
      }
      return;
    }
  } 

  console.log("[Fallback LLM]", {empresaId, telefone, textoCombinado, resultado });
  // integração com a Claude entra aqui
}

iniciarWorkerDebounce(processarMensagemAgregada);
iniciarWorkerFechamento();
console.log("Workers rodando (debounce + fechamento automático)");