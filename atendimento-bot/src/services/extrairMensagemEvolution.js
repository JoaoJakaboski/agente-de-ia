// extrai o texto de uma mensagem da Evolution API (só texto por enquanto,
// áudio/imagem/figurinha ficam pra depois)
function extrairTextoDaMensagem(mensagem) {
  if (!mensagem) return null;

  if (typeof mensagem.conversation === "string") {
    return mensagem.conversation;
  }

  if (mensagem.extendedTextMessage && typeof mensagem.extendedTextMessage.text === "string") {
    return mensagem.extendedTextMessage.text;
  }

  if (mensagem.ephemeralMessage && mensagem.ephemeralMessage.message) {
    return extrairTextoDaMensagem(mensagem.ephemeralMessage.message);
  }

  return null;
}

function extrairTelefoneCliente(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.split("@")[0];
}

module.exports = { extrairTextoDaMensagem, extrairTelefoneCliente };
