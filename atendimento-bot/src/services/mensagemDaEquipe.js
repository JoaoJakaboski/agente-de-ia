const { buscarEmpresaPorInstancia } = require("./empresaService");
const { garantirChamado, atualizarStatusChamado } = require("./chamadoService");
const { registrarMensagem } = require("./mensagensService");
const { foiEnviadaPeloSistema } = require("./evolutionService");

// com estes status, uma resposta da equipe significa que um humano assumiu
const STATUS_ANTES_DO_HUMANO = ["bot", "agente", "aguardando_humano"];

// mensagem enviada do próprio WhatsApp da empresa (celular ou WhatsApp Web)
async function registrarMensagemDaEquipe(instanciaEvolution, telefoneCliente, tipoMensagem, texto) {
  if (await foiEnviadaPeloSistema(instanciaEvolution, telefoneCliente, texto)) return;

  const empresa = await buscarEmpresaPorInstancia(instanciaEvolution);
  if (!empresa) return;

  const chamado = await garantirChamado(empresa.id, telefoneCliente);
  if (!chamado) return;

  const conteudo = texto || `[Mensagem do tipo ${tipoMensagem}]`;
  await registrarMensagem(chamado.id, empresa.id, "humano", conteudo);

  if (STATUS_ANTES_DO_HUMANO.includes(chamado.status)) {
    await atualizarStatusChamado(chamado.id, "em_atendimento_humano");
    console.log(`[Equipe pelo WhatsApp] chamado ${chamado.id} passou para atendimento humano`);
  }
}

module.exports = { registrarMensagemDaEquipe };