const express = require("express");
const rateLimit = require("express-rate-limit");
const { supabase } = require("../db/client");
const { criarClienteAnonimo, criarClienteDoUsuario } = require("./supabaseUsuario");
const { gravarSessao, limparSessao, COOKIE_ACESSO, COOKIE_RENOVACAO } = require("./cookies");
const { exigirSessao, carregarPerfil, renovarSessao } = require("./sessao");

const router = express.Router();

const QUINZE_MINUTOS = 15 * 60 * 1000;
const respostaLimite = { erro: "muitas_tentativas" };

// só tentativas que falham contam para o limite
const limitePorIp = rateLimit({
  windowMs: QUINZE_MINUTOS,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: respostaLimite,
});

const limitePorEmail = rateLimit({
  windowMs: QUINZE_MINUTOS,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => String((req.body && req.body.email) || "").trim().toLowerCase(),
  message: respostaLimite,
});

router.post("/login", limitePorIp, limitePorEmail, async (req, res, next) => {
  try {
    const { email, senha } = req.body || {};
    const dadosValidos =
      typeof email === "string" && typeof senha === "string" &&
      email.length > 0 && email.length <= 254 &&
      senha.length > 0 && senha.length <= 200;

    if (!dadosValidos) return res.status(400).json({ erro: "dados_invalidos" });

    const { data, error } = await criarClienteAnonimo().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    // mensagem única: nunca dizer se o erro foi no e-mail ou na senha
    if (error || !data.session) return res.status(401).json({ erro: "credenciais_invalidas" });

    const perfil = await carregarPerfil(criarClienteDoUsuario(data.session.access_token), data.user.id);
    if (!perfil) {
      await supabase.auth.admin.signOut(data.session.access_token, "local");
      return res.status(403).json({ erro: "acesso_desativado" });
    }

    gravarSessao(res, data.session);
    res.json({ usuario: perfil });
  } catch (erro) {
    next(erro);
  }
});

router.get("/sessao", exigirSessao, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.post("/logout", async (req, res, next) => {
  try {
    let accessToken = req.cookies[COOKIE_ACESSO];

    // token de acesso expirado: renova só para conseguir revogar a sessão
    if (!accessToken) {
      const sessao = await renovarSessao(req.cookies[COOKIE_RENOVACAO]);
      accessToken = sessao && sessao.access_token;
    }

    if (accessToken) {
      const { error } = await supabase.auth.admin.signOut(accessToken, "local");
      if (error) console.error("Erro ao revogar sessão:", error.message);
    }

    limparSessao(res);
    res.status(204).end();
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;