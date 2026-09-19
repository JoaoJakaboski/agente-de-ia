const { Worker } = require("bullmq");
const { redis } = require("./redis");
const { NOME_FILA_DEBOUNCE } = require("./debounceQueue");
const { consumirBuffer } = require("../services/bufferMensagens");

// chamado quando o cliente para de mandar mensagem (fim da janela de debounce)
function iniciarWorkerDebounce(processarMensagemAgregada) {
  const worker = new Worker(
    NOME_FILA_DEBOUNCE,
    async (job) => {
      const { empresaId, empresaSlug, instanciaEvolution, chamadoId, telefone } = job.data;
      const mensagens = await consumirBuffer(empresaId, telefone);
      if (mensagens.length === 0) {
        console.log(`Buffer vazio`);
        return;
      }

      const textoCombinado = mensagens.join("\n");
      await processarMensagemAgregada(empresaId, empresaSlug, instanciaEvolution, chamadoId, telefone, textoCombinado);
    },
    { connection: redis }
  );

  worker.on("failed", (job, err) => {
    console.error(`job ${job && job.id} falhou:`, err);
  });

  return worker;
}

module.exports = { iniciarWorkerDebounce };