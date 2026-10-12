const { criarClienteAnonimo, criarClienteDoUsuario } = require("./supabaseUsuario");
const { gravarSessao, limparSessao, COOKIE_ACESSO, COOKIE_RENOVACAO } = require("./cookies");

// o RLS só devolve a linha se o usuário estiver ativo (empresa_do_usuario() checa isso)
async function carregarPerfil(clienteUsuario, usuarioId) {
  const { data, error } = await clienteUsuario
    .from("usuarios")
    .select("id, nome, papel, empresa_id, empresas(nome)")
    .eq("id", usuarioId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    papel: data.papel,
    empresaId: data.empresa_id,
    empresaNome: data.empresas && data.empresas.nome,
  };
}

async function validarAcesso(accessToken) {
  if (!accessToken) return null;
  const { data, error } = await criarClienteAnonimo().auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

async function renovarSessao(refreshToken) {
  if (!refreshToken) return null;
  const { data, error } = await criarClienteAnonimo().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return null;
  return data.session;
}

async function exigirSessao(req, res, next) {
  try {
    let accessToken = req.cookies[COOKIE_ACESSO];
    let usuarioAuth = await validarAcesso(accessToken);

    if (!usuarioAuth) {
      const sessao = await renovarSessao(req.cookies[COOKIE_RENOVACAO]);
      if (!sessao) {
        limparSessao(res);
        return res.status(401).json({ erro: "sessao_expirada" });
      }
      gravarSessao(res, sessao);
      accessToken = sessao.access_token;
      usuarioAuth = sessao.user;
    }

    const db = criarClienteDoUsuario(accessToken);
    const perfil = await carregarPerfil(db, usuarioAuth.id);
    if (!perfil) {
      limparSessao(res);
      return res.status(403).json({ erro: "acesso_desativado" });
    }

    req.usuario = perfil;
    req.db = db;
    req.accessToken = accessToken;
    next();
  } catch (erro) {
    next(erro);
  }
}

module.exports = { exigirSessao, carregarPerfil, renovarSessao };