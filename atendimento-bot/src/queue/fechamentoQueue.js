const { Queue } = require("bullmq");
const { redis } = require("./redis.js");

const NOME_FILA_FECHAMENTO = "fechamento-automatico";
const HORAS_INATIVIDADE = Number(process.env.HORAS_INATIVIDADE_CHAMADO || 24);

const filaFechamento = new Queue(NOME_FILA_FECHAMENTO, { connection: redis });

async function reagendarFechamentoAutomatico(chamadoId) {
    const jobExistente = await filaFechamento.getJob(chamadoId);
    
    if (jobExistente) {
        const estado = await jobExistente.getState();
        if (estado === "delayed" || estado === "waiting") {
            await jobExistente.remove();
        }
    }

    await filaFechamento.add(
        chamadoId,
        { chamadoId },
        {
            jobId: chamadoId,
            delay: HORAS_INATIVIDADE * 60 * 60 * 1000, // Convertendo horas para milissegundos
            removeOnComplete: true,
            removeOnFail: true
        }
    );
}

module.exports = { filaFechamento, reagendarFechamentoAutomatico, NOME_FILA_FECHAMENTO };