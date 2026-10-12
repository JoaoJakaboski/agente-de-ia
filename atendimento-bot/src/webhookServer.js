require("dotenv/config");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const { receberMensagem } = require("./services/receberMensagem");
const { identificarMensagem, extrairTelefoneCliente } = require("./services/extrairMensagemEvolution");
const rotasPainel = require("./painel");
const { registrarMensagemDaEquipe } = require("./services/mensagemDaEquipe");
const { encerrarConexoes } = require("./painel/tempoReal");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const TOKEN_WEBHOOK = process.env.WEBHOOK_SECRET || "";

// comparação em tempo constante: não revela pelo tempo de resposta quantos caracteres acertou
function tokenWebhookValido(recebido) {
  if (!TOKEN_WEBHOOK || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(TOKEN_WEBHOOK);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get("/", (req, res) => {
  res.status(200).send("ok");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", rotasPainel);

app.post("/webhook/:token", async (req, res) => {
  if (!tokenWebhookValido(req.params.token)) {
    return res.status(404).end();
  }

  // responde logo pra Evolution API não reenviar por timeout
  res.status(200).json({ ok: true });

  try {
    const body = req.body;
    if (body.event !== "messages.upsert") return;

    const dados = body.data;
    if (!dados || !dados.key) return;

    const { tipo, texto } = identificarMensagem(dados.message);
    const telefoneCliente = extrairTelefoneCliente(dados.key.remoteJid);
    const instanciaEvolution = body.instance;

    if (!telefoneCliente || !instanciaEvolution || tipo === "desconhecido") {
      console.log("mensagem ignorada (tipo não suportado ou dados incompletos)");
      return;
    }

    // saiu do número da empresa: o próprio sistema ou alguém da equipe pelo celular
    if (dados.key.fromMe) {
      await registrarMensagemDaEquipe(instanciaEvolution, telefoneCliente, tipo, texto);
      return;
    }

    await receberMensagem(instanciaEvolution, telefoneCliente, tipo, texto);
  } catch (erro) {
    console.error("erro ao processar webhook:", erro);
  }
});

const PORTA = process.env.PORT || 3000;
const servidor = app.listen(PORTA, () => {
  console.log(`servidor rodando na porta ${PORTA}`);
});

function encerrarComCalma() {
  console.log("encerrando servidor...");
  encerrarConexoes();
  servidor.close(() => process.exit(0));
}

process.on("SIGTERM", encerrarComCalma);
process.on("SIGINT", encerrarComCalma);

module.exports = { app };