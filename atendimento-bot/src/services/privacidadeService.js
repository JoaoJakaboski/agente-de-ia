const { supabase } = require("../db/client");

// suba este número quando o texto do aviso ou a política mudar:
// todo cliente recebe o aviso de novo na próxima mensagem
const VERSAO_AVISO = 1;

function textoAviso(nomeEmpresa) {
  const link = process.env.LINK_POLITICA_PRIVACIDADE || "em breve";
  return [
    `Olá! Você está falando com o assistente virtual da ${nomeEmpresa} 🤖`,
    "Para te atender, usamos seu número e o que você escrever aqui. Parte das mensagens é processada por um serviço de inteligência artificial que pode ficar fora do Brasil.",
    `Política de privacidade: ${link}`,
    "Para pedir que seus dados sejam apagados, é só escrever *EXCLUIR DADOS*.",
  ].join("\n\n");
}

// reserva o envio antes de mandar: duas mensagens chegando juntas não geram dois avisos
async function reservarAviso(clienteId) {
  const { data, error } = await supabase
    .from("clientes")
    .update({ privacidade_versao: VERSAO_AVISO, privacidade_informado_em: new Date().toISOString() })
    .eq("id", clienteId)
    .or(`privacidade_versao.is.null,privacidade_versao.lt.${VERSAO_AVISO}`)
    .select("id");

  if (error) {
    console.error("Erro ao reservar aviso de privacidade: ", error);
    return false;
  }
  return data.length > 0;
}

// o envio falhou: libera para tentar de novo na próxima mensagem
async function liberarAviso(clienteId) {
  const { error } = await supabase
    .from("clientes")
    .update({ privacidade_versao: null, privacidade_informado_em: null })
    .eq("id", clienteId);
  if (error) console.error("Erro ao liberar aviso de privacidade: ", error);
}

const FRASES_EXCLUSAO = ["excluir dados", "excluir meus dados", "apagar dados", "apagar meus dados"];

// só a frase exata, para não confundir com "quero excluir um item do pedido"
function ehPedidoDeExclusao(texto) {
  const normalizado = String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return FRASES_EXCLUSAO.includes(normalizado);
}

module.exports = { VERSAO_AVISO, textoAviso, reservarAviso, liberarAviso, ehPedidoDeExclusao };