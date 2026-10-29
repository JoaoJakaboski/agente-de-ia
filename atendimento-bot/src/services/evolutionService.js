const crypto = require("crypto");
const { redis } = require("../queue/redis");

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const VALIDADE_MARCA_SEGUNDOS = 120;

// identifica um envio pelo destino e pelo texto exato; só o hash vai para o Redis
function chaveEnvio(instancia, telefone, texto) {
  const resumo = crypto.createHash("sha256").update(String(texto).trim()).digest("hex");
  return `enviada-pelo-sistema:${instancia}:${String(telefone).replace(/\D/g, "")}:${resumo}`;
}

// a Evolution devolve pelo webhook (fromMe) também o que o próprio sistema enviou;
// é um contador para o caso de o mesmo texto ser enviado duas vezes em sequência
async function foiEnviadaPeloSistema(instancia, telefone, texto) {
  if (!texto) return false;
  const chave = chaveEnvio(instancia, telefone, texto);
  const restante = await redis.decr(chave);
  if (restante <= 0) await redis.del(chave);
  return restante >= 0;
}

async function enviarMensagemWhatsapp(instancia, telefoneCliente, texto) {
  try {
    const chave = chaveEnvio(instancia, telefoneCliente, texto);
    await redis.multi().incr(chave).expire(chave, VALIDADE_MARCA_SEGUNDOS).exec();

    const resposta = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instancia}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: telefoneCliente,
        text: texto,
      }),
    });

    if (!resposta.ok) {
      console.error("Falha ao enviar mensagem:", resposta.status, await resposta.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error.message);
    return false;
  }
}

// confere se o número tem WhatsApp e devolve o número como o WhatsApp o identifica (o JID),
// que é o mesmo formato que chega pelo webhook
async function numeroNoWhatsapp(instancia, numero) {
  try {
    const resposta = await fetch(`${EVOLUTION_API_URL}/chat/whatsappNumbers/${instancia}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ numbers: [numero] }),
    });

    if (!resposta.ok) {
      console.error("Falha ao verificar número no WhatsApp:", resposta.status, await resposta.text());
      return { erro: true };
    }

    const [resultado] = await resposta.json();
    if (!resultado || !resultado.exists || !resultado.jid) return { existe: false };
    return { existe: true, telefone: resultado.jid.split("@")[0] };
  } catch (erro) {
    console.error("Erro ao verificar número no WhatsApp:", erro.message);
    return { erro: true };
  }
}

module.exports = { enviarMensagemWhatsapp, foiEnviadaPeloSistema, numeroNoWhatsapp };