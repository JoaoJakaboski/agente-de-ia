require("dotenv/config");
const express = require("express");
const { receberMensagem } = require("./services/receberMensagem");
const { extrairTextoDaMensagem, extrairTelefoneCliente } = require("./services/extrairMensagemEvolution");

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOKEN_WEBHOOK = process.env.WEBHOOK_SECRET || "";

app.get("/", (req, res) => {
  res.status(200).send("ok");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/webhook/:token", async (req, res) => {
  if (!TOKEN_WEBHOOK || req.params.token !== TOKEN_WEBHOOK) {
    return res.status(404).end();
  }

  // responde logo pra Evolution API não reenviar por timeout;
  res.status(200).json({ ok: true });

  try {
    const body = req.body;
    if (body.event !== "messages.upsert") return;

    const dados = body.data;
    if (!dados || (dados.key && dados.key.fromMe)) return;

    const texto = extrairTextoDaMensagem(dados.message);
    const telefoneCliente = extrairTelefoneCliente(dados.key && dados.key.remoteJid);
    const instanciaEvolution = body.instance;

    if (!texto || !telefoneCliente || !instanciaEvolution) {
      console.log("mensagem ignorada (tipo não suportado ou dados incompletos)");
      return;
    }

    await receberMensagem(instanciaEvolution, telefoneCliente, texto);
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
  servidor.close(() => process.exit(0));
}

process.on("SIGTERM", encerrarComCalma);
process.on("SIGINT", encerrarComCalma);

module.exports = { app };
