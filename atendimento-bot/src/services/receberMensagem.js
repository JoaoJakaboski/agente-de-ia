const { buscarEmpresaPorInstancia, segundosDebounceDaEmpresa, configuracaoAgenteDaEmpresa } = require("./empresaService");
const { adicionarMensagemAoBuffer } = require("./bufferMensagens");
const { reagendarProcessamento } = require("../queue/debounceQueue");
const { garantirChamado, atualizarStatusChamado } = require("./chamadoService");
const { registrarMensagem } = require("./mensagensService");
const { enviarMensagemWhatsapp } = require("./evolutionService");
const { respostaPorIntencao } = require("./regrasFaqService");

const RESPOSTAS_PADRAO = {
  audio: "No momento não conseguimos processar áudios — pode escrever sua mensagem em texto? 🙏",
  sticker: "Não consigo processar esse tipo de mensagem — pode escrever em texto? 🙏",
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
    const aviso = `Olá!!! Você está falando com o assistente virtual da ${empresa.nome} 🤖. Usamos seus dados só pra te atender. Política de privacidade: ${link}`;
    await enviarMensagemWhatsapp(instanciaEvolution, telefoneCliente, aviso);
    await registrarMensagem(chamado.id, empresa.id, "bot", aviso);
  }

  // atendente já está cuidando dessa conversa: bot fica quieto, só registra
  if (chamado.status === "aguardando_humano" || chamado.status == "em_atendimento_humano") {
    return;
  }

  // bot desligado no painel: a mensagem fica registrada e vai direto para a equipe
  const config = configuracaoAgenteDaEmpresa(empresa);
  if (config && config.ativo === false) {
    if (chamado.status === "bot" || chamado.status === "agente") {
      await atualizarStatusChamado(chamado.id, "aguardando_humano", "bot_desligado");
    }
    return;
  }

  if (tipoMensagem === "audio" || tipoMensagem === "sticker") {
    const resposta = RESPOSTAS_PADRAO[tipoMensagem];
    await enviarMensagemWhatsapp(instanciaEvolution, telefoneCliente, resposta);
    await registrarMensagem(chamado.id, empresa.id, "bot", resposta);
    return;
  }
  
  await adicionarMensagemAoBuffer(empresa.id, telefoneCliente, conteudoRegistrado);
  const segundos = segundosDebounceDaEmpresa(empresa);
  await reagendarProcessamento(empresa.id, empresa.slug, instanciaEvolution, chamado.id, telefoneCliente, segundos, config, chamado.isNovo);
}

module.exports = { receberMensagem };