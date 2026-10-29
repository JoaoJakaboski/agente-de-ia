const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const rotasAuth = require("./rotasAuth");
const rotasChamados = require("./rotasChamados");
const { exigirSessao } = require("./sessao");
const { iniciarEscutaBanco, rotaEventos } = require("./tempoReal");
const rotasAcoes = require("./rotasAcoes");
const rotasAdmin = require("./rotasAdmin");
const rotasClientes = require("./rotasClientes");

const ORIGENS_PERMITIDAS = (process.env.PAINEL_ORIGEM || "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

const router = express.Router();

router.use(cookieParser());

router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "muitas_requisicoes" },
}));

// CSRF: requisições que alteram algo precisam vir do painel e em JSON
router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origem = req.get("Origin");
  if (!origem || !ORIGENS_PERMITIDAS.includes(origem)) {
    return res.status(403).json({ erro: "origem_nao_permitida" });
  }
  if (!req.is("application/json")) {
    return res.status(415).json({ erro: "use_json" });
  }
  next();
});

router.use("/auth", rotasAuth);
router.use("/chamados", rotasAcoes);
router.use("/chamados", rotasChamados);
router.use("/admin", rotasAdmin);
router.get("/eventos", exigirSessao, rotaEventos);
router.use("/clientes", rotasClientes);

router.use((req, res) => {
  res.status(404).json({ erro: "nao_encontrado" });
});

// erro inesperado: registra no log e responde sem detalhes internos
router.use((erro, req, res, next) => {
  console.error("Erro na API do painel:", erro);
  res.status(500).json({ erro: "erro_interno" });
});

iniciarEscutaBanco();
module.exports = router;