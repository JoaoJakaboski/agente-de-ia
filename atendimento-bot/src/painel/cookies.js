const PRODUCAO = process.env.NODE_ENV === "production";
const COOKIE_ACESSO = "pa_acesso";
const COOKIE_RENOVACAO = "pa_renovacao";
const DIAS_RENOVACAO = 7;

const opcoesBase = { httpOnly: true, secure: PRODUCAO, sameSite: "strict", path: "/api" };

function gravarSessao(res, sessao) {
  res.cookie(COOKIE_ACESSO, sessao.access_token, { ...opcoesBase, maxAge: sessao.expires_in * 1000 });
  res.cookie(COOKIE_RENOVACAO, sessao.refresh_token, { ...opcoesBase, maxAge: DIAS_RENOVACAO * 24 * 60 * 60 * 1000 });
}

function limparSessao(res) {
  res.clearCookie(COOKIE_ACESSO, opcoesBase);
  res.clearCookie(COOKIE_RENOVACAO, opcoesBase);
}

module.exports = { gravarSessao, limparSessao, COOKIE_ACESSO, COOKIE_RENOVACAO };