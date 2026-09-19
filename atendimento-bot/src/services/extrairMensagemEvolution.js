function identificarMensagem(mensagem) {
  if (!mensagem) return { tipo: "desconhecido", texto: null };

  if (typeof mensagem.conversation === "string") {
    return { tipo: "texto", texto: mensagem.conversation };
  }

  if (mensagem.extendedTextMessage && typeof mensagem.extendedTextMessage.text === "string") {
    return { tipo: "texto", texto: mensagem.extendedTextMessage.text };
  }

  if (mensagem.ephemeralMessage && mensagem.ephemeralMessage.message) {
    return identificarMensagem(mensagem.ephemeralMessage.message);
  }

  if (mensagem.imageMessage) return { tipo: "imagem", texto: mensagem.imageMessage.caption || null };
  if (mensagem.documentMessage) return { tipo: "documento", texto: mensagem.documentMessage.caption || null };
  if (mensagem.audioMessage) return { tipo: "audio", texto: null };
  if (mensagem.stickerMessage) return { tipo: "sticker", texto: null };
  if (mensagem.videoMessage) return { tipo: "video", texto: mensagem.videoMessage.caption || null };

  return { tipo: "desconhecido", texto: null };
}

function extrairTelefoneCliente(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.split("@")[0];
}

module.exports = { identificarMensagem, extrairTelefoneCliente };