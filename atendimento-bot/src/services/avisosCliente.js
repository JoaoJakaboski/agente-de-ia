const { enviarMensagemWhatsapp } = require("./evolutionService");
const { registrarMensagem } = require("./mensagensService");

const AVISOS = {
  encaminhado: "Encaminhei sua mensagem para a nossa equipe. Assim que alguém estiver disponível, a conversa continua por aqui. 🙂",
  transferido: "Seu atendimento vai continuar com outra pessoa da nossa equipe. Assim que alguém estiver disponível, a conversa continua por aqui. 🙂",
  exclusao: "Recebemos seu pedido para apagar seus dados. Alguém da nossa equipe vai confirmar com você por aqui e, em seguida, seus dados e o histórico das conversas serão apagados.",
};

// envia pelo WhatsApp e registra na conversa; devolve se chegou
async function avisarCliente(instancia, telefone, chamadoId, empresaId, texto) {
  const enviada = await enviarMensagemWhatsapp(instancia, telefone, texto);
  if (enviada) {
    await registrarMensagem(chamadoId, empresaId, "bot", texto);
  } else {
    console.error(`[Aviso ao cliente] não foi enviado para o chamado ${chamadoId}`);
  }
  return enviada;
}

module.exports = { AVISOS, avisarCliente };