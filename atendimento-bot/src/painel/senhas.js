const crypto = require("crypto");
const { supabase } = require("../db/client");
const { enviarEmail } = require("../services/emailService");

const URL_PAINEL = (process.env.URL_PAINEL || "http://localhost:5173").replace(/\/+$/, "");
const VALIDADE_MS = { convite: 48 * 60 * 60 * 1000, redefinicao: 60 * 60 * 1000 };
const SENHA_MIN = 8;
const SENHA_MAX_BYTES = 72; // limite do bcrypt, que o Supabase Auth usa
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes em base64url

function resumo(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function senhaValida(senha) {
  return typeof senha === "string" && senha.length >= SENHA_MIN && Buffer.byteLength(senha, "utf8") <= SENHA_MAX_BYTES;
}

// um link novo invalida os anteriores do mesmo usuário
async function criarToken(usuarioId, tipo) {
  const agora = new Date();
  const { error: erroAnteriores } = await supabase
    .from("tokens_senha")
    .update({ usado_em: agora.toISOString() })
    .eq("usuario_id", usuarioId)
    .is("usado_em", null);
  if (erroAnteriores) throw erroAnteriores;

  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await supabase.from("tokens_senha").insert({
    usuario_id: usuarioId,
    tipo,
    token_hash: resumo(token),
    expira_em: new Date(agora.getTime() + VALIDADE_MS[tipo]).toISOString(),
  });
  if (error) throw error;
  return token;
}

// devolve o link se ainda vale (não usado, no prazo, usuário ativo); senão, null
async function buscarTokenValido(token) {
  if (typeof token !== "string" || !FORMATO_TOKEN.test(token)) return null;

  const { data, error } = await supabase
    .from("tokens_senha")
    .select("id, usuario_id, tipo, usuarios(nome, ativo)")
    .eq("token_hash", resumo(token))
    .is("usado_em", null)
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.usuarios || !data.usuarios.ativo) return null;

  return { id: data.id, usuarioId: data.usuario_id, tipo: data.tipo, nome: data.usuarios.nome };
}

async function marcarTokenUsado(id) {
  const { error } = await supabase.from("tokens_senha").update({ usado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function enviarLinkSenha(usuarioId, tipo) {
  const [{ data: dadosAuth, error: erroAuth }, { data: usuario, error: erroUsuario }] = await Promise.all([
    supabase.auth.admin.getUserById(usuarioId),
    supabase.from("usuarios").select("nome, empresas(nome)").eq("id", usuarioId).single(),
  ]);
  if (erroAuth) throw erroAuth;
  if (erroUsuario) throw erroUsuario;

  const token = await criarToken(usuarioId, tipo);
  const link = `${URL_PAINEL}/definir-senha?token=${token}`;
  const primeiroNome = String(usuario.nome || "").trim().split(/\s+/)[0] || "";
  const empresa = (usuario.empresas && usuario.empresas.nome) || "sua empresa";
  const convite = tipo === "convite";

  const assunto = convite
    ? `Seu acesso ao painel de atendimento da ${empresa}`
    : "Redefinição de senha do painel de atendimento";
  const paragrafos = convite
    ? [
        `Olá${primeiroNome ? `, ${primeiroNome}` : ""}!`,
        `Você foi convidado para o painel de atendimento da ${empresa}.`,
        "Para ativar seu acesso, crie sua senha pelo link abaixo. Ele vale por 48 horas e só pode ser usado uma vez.",
      ]
    : [
        `Olá${primeiroNome ? `, ${primeiroNome}` : ""}!`,
        "Recebemos um pedido para redefinir a senha do seu acesso ao painel de atendimento.",
        "Para criar uma senha nova, use o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez.",
        "Se não foi você, ignore este e-mail: sua senha atual continua valendo.",
      ];
  const rotuloBotao = convite ? "Criar minha senha" : "Criar senha nova";

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 22px; color: #1b1f1d; max-width: 520px;">
      ${paragrafos.map((p) => `<p>${escaparHtml(p)}</p>`).join("")}
      <p style="margin: 28px 0;">
        <a href="${link}" style="background: #1f8f6a; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">${rotuloBotao}</a>
      </p>
      <p style="font-size: 13px; color: #5d6662;">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${link}</p>
    </div>`;

  await enviarEmail({
    para: dadosAuth.user.email,
    assunto,
    texto: [...paragrafos, "", `${rotuloBotao}: ${link}`].join("\n"),
    html,
  });
}

module.exports = { senhaValida, buscarTokenValido, marcarTokenUsado, enviarLinkSenha };