const { redis } = require("../queue/redis");

function chaveBuffer(empresaId, telefone) {
  return `buffer:${empresaId}:${telefone}`;
}

// adiciona uma mensagem na fila de espera do cliente
async function adicionarMensagemAoBuffer(empresaId, telefone, texto) {
  await redis.rpush(chaveBuffer(empresaId, telefone), texto);
}

// lê e limpa o buffer de uma vez (transação, evita perder mensagem)
async function consumirBuffer(empresaId, telefone) {
  const chave = chaveBuffer(empresaId, telefone);
  const resultado = await redis.multi().lrange(chave, 0, -1).del(chave).exec();

  if (!resultado) return [];

  const [, lrangeResultado] = resultado[0];
  return lrangeResultado || [];
}

module.exports = { adicionarMensagemAoBuffer, consumirBuffer };
