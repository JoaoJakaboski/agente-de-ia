const { buscarEmpresaPorInstancia, segundosDebounceDaEmpresa } = require("./empresaService");
const { adicionarMensagemAoBuffer } = require("./bufferMensagens");
const { reagendarProcessamento } = require("../queue/debounceQueue");
const { garantirChamado, atualizarStatusChamado } = require("./chamadoService");
const { registrarMensagem } = require("./mensagensService");
const { enviarMensagemWhatsapp } = require("./evolutionService");
const { respostaPorIntencao } = require("./regrasFaqService");

const RESPOSTAS_PADRAO = {
  imagem: "Recebemos sua imagem! Nossa equipe vai analisar. 📷",
  documento: "Recebemos seu arquivo! Nossa equipe vai analisar e confirmar os detalhes. 📎",
  audio: "No momento não conseguimos processar áudios — pode escrever sua mensagem em texto? 🙏",
  sticker: "Não consigo processar esse tipo de mensagem — pode escrever em texto? 🙏",
  video: "Recebemos seu vídeo! Nossa equipe vai analisar. 🎥",
};

async function receberMensagem(instanciaEvolution, telefoneCliente, tipoMensagem, texto) {
  const empresa = await buscarEmpresaPorInstancia(instanciaEvolution);
  if (!empresa) {
    console.warn(`Instância não cadastrada: ${instanciaEvolution}`);
    return;
  }

  const chamado = await garantirChamado(empresa.id, telefoneCliente);
  if (!chamado) return;

  const conteudoRegistrado = texto || `[Mensagem do tipo ${tipoMensagem}]`;
  await registrarMensagem(chamado.id, empresa.id, "cliente", conteudoRegistrado);

  if (chamado.isNovo) {
    const link = process.env.LINK_POLITICA_PRIVACIDADE || "em_breve";
    const aviso = `Você está falando com o assistente virtual da ${empresa.nome} 🤖. Usamos seus dados só pra te atender. Política de privacidade: ${link}`;
    await enviarMensagemWhatsapp(instanciaEvolution, telefoneCliente, aviso);
    await registrarMensagem(chamado.id, empresa.id, "bot", aviso);

    const saudacao = await respostaPorIntencao(empresa.id, "saudacao");
    if (saudacao) {
      await enviarMensagemWhatsapp(instanciaEvolution, telefoneCliente, saudacao.resposta);
      await registrarMensagem(chamado.id, empresa.id, "bot", saudacao.resposta);
    }
  }

  // atendente já está cuidando dessa conversa: bot fica quieto, só registra
  if (chamado.status === "aguardando_humano" || chamado.status == "em_atendimento_humano") {
    return;
  }

  if (tipoMensagem !== "texto") {
    const resposta = RESPOSTAS_PADRAO[tipoMensagem] || "Não consegui entender essa mensagem — pode escrever em texto? 🙏";
    await enviarMensagemWhatsapp(instanciaEvolution, telefoneCliente, resposta);
    await registrarMensagem(chamado.id, empresa.id, "bot", resposta);

    if (tipoMensagem == "imagem" || tipoMensagem == "documento" || tipoMensagem == "video") {
       const assunto = `Recebido: ${tipoMensagem}`;
      await atualizarStatusChamado(chamado.id, "aguardando_humano", assunto);
      console.log(`[Chamado escalado] ${assunto}`);
    }
    return;
  }

  await adicionarMensagemAoBuffer(empresa.id, telefoneCliente, texto);
  const segundos = segundosDebounceDaEmpresa(empresa);
  await reagendarProcessamento(empresa.id, empresa.slug, instanciaEvolution, chamado.id, telefoneCliente, segundos);
}

module.exports = { receberMensagem };