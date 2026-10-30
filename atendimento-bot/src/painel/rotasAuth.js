const express = require("express");
const rateLimit = require("express-rate-limit");
const { supabase } = require("../db/client");
const { criarClienteAnonimo, criarClienteDoUsuario } = require("./supabaseUsuario");
const { gravarSessao, limparSessao, COOKIE_ACESSO, COOKIE_RENOVACAO } = require("./cookies");
const { exigirSessao, carregarPerfil, renovarSessao } = require("./sessao");
const { senhaValida, buscarTokenValido, marcarTokenUsado, enviarLinkSenha } = require("./senhas");

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

// "esqueci a senha" conta todos os pedidos, não só os que falham: cada um manda um e-mail
const limiteEsqueciPorIp = rateLimit({
  windowMs: QUINZE_MINUTOS,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: respostaLimite,
});

const limiteEsqueciPorEmail = rateLimit({
  windowMs: QUINZE_MINUTOS,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => String((req.body && req.body.email) || "").trim().toLowerCase(),
  message: respostaLimite,
});

// links e troca de senha: só as tentativas que falham contam
const limiteSenha = rateLimit({
  windowMs: QUINZE_MINUTOS,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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

async function enviarRedefinicao(email) {
  const { data, error } = await supabase.rpc("usuario_por_email", { p_email: email });
  if (error) throw error;
  const usuario = data && data[0];
  if (!usuario || !usuario.ativo) return;
  await enviarLinkSenha(usuario.id, "redefinicao");
}

// a resposta é a mesma exista ou não a conta, e sai antes do envio:
// nem o conteúdo nem o tempo de resposta revelam quais e-mails estão cadastrados
router.post("/esqueci-senha", limiteEsqueciPorIp, limiteEsqueciPorEmail, (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  if (!email || email.length > 254) return res.status(400).json({ erro: "dados_invalidos" });

  res.status(202).json({ ok: true });
  enviarRedefinicao(email).catch((erro) => console.error("Erro ao enviar redefinição de senha:", erro.message || erro));
});

router.post("/verificar-token", limiteSenha, async (req, res, next) => {
  try {
    const registro = await buscarTokenValido(req.body.token);
    if (!registro) return res.status(400).json({ erro: "token_invalido" });
    res.json({ tipo: registro.tipo, nome: registro.nome });
  } catch (erro) {
    next(erro);
  }
});

router.post("/definir-senha", limiteSenha, async (req, res, next) => {
  try {
    const { token, senha } = req.body || {};
    if (!senhaValida(senha)) return res.status(400).json({ erro: "senha_invalida" });

    const registro = await buscarTokenValido(token);
    if (!registro) return res.status(400).json({ erro: "token_invalido" });

    const { data: dadosAuth, error } = await supabase.auth.admin.updateUserById(registro.usuarioId, {
      password: senha,
      email_confirm: true,
    });
    if (error) {
      if (error.status === 422) return res.status(400).json({ erro: "senha_invalida" });
      throw error;
    }

    await marcarTokenUsado(registro.id);

    // redefinição: quem estiver logado com a senha antiga, em qualquer aparelho, sai
    if (registro.tipo === "redefinicao") {
      const { data: entrada } = await criarClienteAnonimo().auth.signInWithPassword({
        email: dadosAuth.user.email,
        password: senha,
      });
      if (entrada && entrada.session) await supabase.auth.admin.signOut(entrada.session.access_token, "global");
    }

    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/alterar-senha", exigirSessao, limiteSenha, async (req, res, next) => {
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    if (typeof senhaAtual !== "string" || !senhaAtual || senhaAtual.length > 200) {
      return res.status(400).json({ erro: "dados_invalidos" });
    }
    if (!senhaValida(novaSenha)) return res.status(400).json({ erro: "senha_invalida" });

    const { data: dadosAuth, error: erroAuth } = await supabase.auth.admin.getUserById(req.usuario.id);
    if (erroAuth) throw erroAuth;

    // confere a senha atual com um login à parte, desfeito logo em seguida
    const { data: conferencia, error: erroConferencia } = await criarClienteAnonimo().auth.signInWithPassword({
      email: dadosAuth.user.email,
      password: senhaAtual,
    });
    if (erroConferencia || !conferencia.session) return res.status(400).json({ erro: "senha_atual_incorreta" });
    await supabase.auth.admin.signOut(conferencia.session.access_token, "local");

    const { error } = await supabase.auth.admin.updateUserById(req.usuario.id, { password: novaSenha });
    if (error) {
      if (error.status === 422) return res.status(400).json({ erro: "senha_invalida" });
      throw error;
    }

    // os outros navegadores saem; este continua logado
    await supabase.auth.admin.signOut(req.accessToken, "others");
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;