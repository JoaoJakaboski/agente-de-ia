const { Queue } = require("bullmq");
const { redis } = require("./redis");

const NOME_FILA_DEBOUNCE = "debounce-mensagens";

const filaDebounce = new Queue(NOME_FILA_DEBOUNCE, {
  connection: redis,
});

function jobId(empresaId, telefone) {
  return `${empresaId}__${telefone}`;
}

// reagenda o processamento do cliente: se já tinha um job esperando,
// cancela e cria outro com o tempo zerado de novo (debounce)
async function reagendarProcessamento(empresaId, empresaSlug, telefone, segundosDebounce) {
  const id = jobId(empresaId, telefone);

  const jobExistente = await filaDebounce.getJob(id);
  if (jobExistente) {
    const estado = await jobExistente.getState();
    if (estado === "delayed" || estado === "waiting") {
      await jobExistente.remove();
    }
  }

  await filaDebounce.add(
    id,
    { empresaId, empresaSlug, telefone },
    {
      jobId: id,
      delay: segundosDebounce * 1000,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

module.exports = { filaDebounce, reagendarProcessamento, NOME_FILA_DEBOUNCE };
