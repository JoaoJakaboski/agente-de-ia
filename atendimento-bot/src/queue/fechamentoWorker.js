const { Worker } = require("bullmq");
const { redis } = require("./redis.js");
const { NOME_FILA_FECHAMENTO } = require("./fechamentoQueue.js");
const { fecharChamadoPorInatividade } = require("../services/chamadoService.js");

function iniciarWorkerFechamento() {
    const worker = new Worker(
        NOME_FILA_FECHAMENTO,
        async (job) => {
            await fecharChamadoPorInatividade(job.data.chamadoId);
        },
        { connection: redis } 
    );
        
    worker.on("failed", (job, err) => {
        console.error(`Job de fechamento ${job && job.id} falhou: `, err);
    });

    return worker;
}

module.exports = { iniciarWorkerFechamento };