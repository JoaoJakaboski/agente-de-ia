const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// nunca guardar sessão em memória: o servidor atende vários usuários ao mesmo tempo
const semSessao = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// cliente sem usuário: usado só para login e renovação de sessão
function criarClienteAnonimo() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, semSessao);
}

// cliente que age como o usuário logado: toda consulta passa pelo RLS
function criarClienteDoUsuario(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...semSessao,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = { criarClienteAnonimo, criarClienteDoUsuario };