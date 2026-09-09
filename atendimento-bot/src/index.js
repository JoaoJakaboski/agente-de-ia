require("dotenv/config");
const { iniciarWorkerDebounce } = require("./queue/debounceWorker");
const { classificarIntencao } = require("./services/classificadorService");
const { respostaPorIntencao } = require("./services/regrasFaqService");
const { enviarMensagemWhatsapp } = require("./services/evolutionService");
const { abrirOuAtualizarChamado } = require("./services/chamadoService");
require("./webhookServer");

const LIMIAR_CONFIANCA_PADRAO = Number(process.env.LIMIAR_CONFIANCA_DEFAULT || 0.6);

// pipeline híbrido: classificador ML -> regras (por empresa) -> fallback LLM
async function processarMensagemAgregada(empresaId, empresaSlug, instanciaEvolution, telefone, textoCombinado) {
  const resultado = await classificarIntencao(empresaSlug, textoCombinado);

  if (resultado && resultado.confianca >= LIMIAR_CONFIANCA_PADRAO) {
    const regra = await respostaPorIntencao(empresaId, resultado.intencao);
    if (regra) {
      console.log(`[regra] ${resultado.intencao} (${resultado.confianca.toFixed(2)})`);
      console.log("texto classificado: ", textoCombinado);
      console.log("resposta:", regra.resposta);
      // enviar resposta via Evolution API entra aqui
      await enviarMensagemWhatsapp(instanciaEvolution, telefone, regra.resposta);

      if (regra.escalarHumano) {
        await abrirOuAtualizarChamado(empresaId, telefone, resultado.intencao);
        console.log(`[chamado aberto] ${resultado.intencao}`)
      }
      return;
    }
  }

  // confiança baixa ou intenção sem regra cadastrada -> fallback LLM (Claude)
  // nunca enviar telefone/IDs internos pro prompt da LLM, só o texto
  console.log("[fallback LLM]", { empresaId, telefone, textoCombinado, resultado });
  // integração com a Claude entra aqui
}

iniciarWorkerDebounce(processarMensagemAgregada);
console.log("worker de debounce rodando");