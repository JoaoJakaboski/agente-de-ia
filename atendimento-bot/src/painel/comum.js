const { supabase } = require("../db/client");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function agora() {
  return new Date().toISOString();
}

function primeiroNome(nome) {
  return String(nome || "").trim().split(/\s+/)[0] || "Atendente";
}

// tira caracteres de controle e espaços repetidos; vazio vira null (sem nome)
function limparNome(valor) {
  if (typeof valor !== "string") return undefined;
  const nome = valor.replace(/\p{C}/gu, "").replace(/\s+/g, " ").trim();
  if (nome.length > 80) return undefined;
  return nome || null;
}

async function instanciaDaEmpresa(empresaId) {
  const { data, error } = await supabase.from("empresas").select("instancia_evolution").eq("id", empresaId).single();
  if (error) throw error;
  return data.instancia_evolution;
}

module.exports = { UUID, agora, primeiroNome, limparNome, instanciaDaEmpresa };