const { supabase } = require("../db/client");

const clientes = new Set();
let canalOnline = false;

// a conexão é encerrada de tempos em tempos; o navegador reconecta sozinho
// e, ao reconectar, a sessão é validada de novo (pega usuário desativado)
const DURACAO_MAXIMA_MS = 15 * 60 * 1000;
const BATIMENTO_MS = 25 * 1000;

function escrever(res, evento, dados) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
}

function avisarEmpresa(empresaId, evento, dados) {
  for (const cliente of clientes) {
    if (cliente.empresaId === empresaId) escrever(cliente.res, evento, dados);
  }
}

function avisarTodos(evento, dados) {
  for (const cliente of clientes) escrever(cliente.res, evento, dados);
}

function iniciarEscutaBanco() {
  supabase
    .channel("painel-atendimento")
    .on("postgres_changes", { event: "*", schema: "public", table: "chamados" }, (payload) => {
      const linha = payload.new && payload.new.id ? payload.new : null;
      if (!linha || !linha.empresa_id) return;
      avisarEmpresa(linha.empresa_id, "chamado", { chamadoId: linha.id });
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (payload) => {
      const mensagem = payload.new;
      if (!mensagem || !mensagem.empresa_id) return;
      avisarEmpresa(mensagem.empresa_id, "mensagem", { chamadoId: mensagem.chamado_id });
    })
    .subscribe((status, erro) => {
      const online = status === "SUBSCRIBED";
      if (online !== canalOnline) {
        canalOnline = online;
        avisarTodos("estado", { online });
      }
      console.log(`[Tempo real] canal: ${status}${erro ? ` — ${erro.message || erro}` : ""}`);
    });
}

function rotaEventos(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const cliente = { empresaId: req.usuario.empresaId, res };
  clientes.add(cliente);

  res.write("retry: 3000\n\n");
  escrever(res, "estado", { online: canalOnline });

  const batimento = setInterval(() => escrever(res, "ping", {}), BATIMENTO_MS);
  const limite = setTimeout(() => res.end(), DURACAO_MAXIMA_MS);

  req.on("close", () => {
    clearInterval(batimento);
    clearTimeout(limite);
    clientes.delete(cliente);
  });
}

// usado no desligamento: conexões de tempo real abertas impediriam o servidor de fechar
function encerrarConexoes() {
  for (const cliente of clientes) cliente.res.end();
  clientes.clear();
}

module.exports = { iniciarEscutaBanco, rotaEventos, encerrarConexoes };