const { buscarEmpresaPorInstancia, segundosDebounceDaEmpresa } = require("./empresaService");
const { adicionarMensagemAoBuffer } = require("./bufferMensagens");
const { reagendarProcessamento } = require("../queue/debounceQueue");

// chamado pelo webhook a cada mensagem recebida
async function receberMensagem(instanciaEvolution, telefoneCliente, texto) {
  const empresa = await buscarEmpresaPorInstancia(instanciaEvolution);

  if (!empresa) {
    console.warn(`instância não cadastrada: ${instanciaEvolution}`);
    return;
  }

  await adicionarMensagemAoBuffer(empresa.id, telefoneCliente, texto);

  const segundos = segundosDebounceDaEmpresa(empresa);
  await reagendarProcessamento(empresa.id, empresa.slug, telefoneCliente, segundos);
}

module.exports = { receberMensagem };
