const express = require("express");
const { supabase } = require("../db/client");
const { exigirSessao } = require("./sessao");
const { UUID, agora, limparNome } = require("./comum");
const { enviarLinkSenha } = require("./senhas");
const { encerrarConexoesDoUsuario } = require("./tempoReal");

const router = express.Router();
router.use(exigirSessao);
router.use((req, res, next) => {
  if (req.usuario.papel !== "admin") return res.status(403).json({ erro: "somente_admin" });
  next();
});

const PAPEIS = ["admin", "atendente"];
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function verificar({ data, error }) {
  if (error) throw error;
  return data;
}

function situacao(usuario) {
  if (!usuario.ativo) return "desativado";
  return usuario.ultimo_acesso ? "ativo" : "pendente";
}

// o alvo precisa ser da mesma empresa do administrador
async function carregarAlvo(req, res) {
  const { id } = req.params;
  if (!UUID.test(id)) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }

  const alvo = verificar(
    await supabase
      .from("usuarios")
      .select("id, nome, papel, ativo")
      .eq("id", id)
      .eq("empresa_id", req.usuario.empresaId)
      .maybeSingle()
  );
  if (!alvo) {
    res.status(404).json({ erro: "nao_encontrado" });
    return null;
  }
  return alvo;
}

// ninguém altera papel, desativa ou exclui a si mesmo; como só um admin ativo chega aqui,
// isso também garante que a empresa nunca fica sem administrador
function ehOProprio(req, res, alvo) {
  if (alvo.id !== req.usuario.id) return false;
  res.status(409).json({ erro: "proprio_usuario" });
  return true;
}

async function nuncaEntrou(usuarioId) {
  const { data, error } = await supabase.auth.admin.getUserById(usuarioId);
  if (error) throw error;
  return !data.user.last_sign_in_at;
}

router.get("/", async (req, res, next) => {
  try {
    const linhas = verificar(await supabase.rpc("usuarios_da_empresa", { p_empresa_id: req.usuario.empresaId }));
    res.json({
      usuarios: linhas.map((usuario) => ({ ...usuario, situacao: situacao(usuario), voce: usuario.id === req.usuario.id })),
    });
  } catch (erro) {
    next(erro);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const nome = limparNome(req.body.nome);
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const { papel } = req.body;
    if (!nome || email.length > 254 || !FORMATO_EMAIL.test(email) || !PAPEIS.includes(papel)) {
      return res.status(400).json({ erro: "dados_invalidos" });
    }

    // login sem senha: a pessoa cria a senha pelo link do convite
    const { data: criado, error: erroCriacao } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (erroCriacao) {
      if (erroCriacao.status === 422) return res.status(409).json({ erro: "email_em_uso" });
      throw erroCriacao;
    }
    const id = criado.user.id;

    const { error: erroPerfil } = await supabase
      .from("usuarios")
      .insert({ id, empresa_id: req.usuario.empresaId, nome, papel, ativo: true });
    if (erroPerfil) {
      await supabase.auth.admin.deleteUser(id); // não deixa um login sem perfil para trás
      throw erroPerfil;
    }

    // o usuário fica criado mesmo se o e-mail falhar; o painel oferece reenviar
    let conviteEnviado = true;
    try {
      await enviarLinkSenha(id, "convite");
    } catch (erro) {
      conviteEnviado = false;
      console.error("Erro ao enviar convite:", erro.message || erro);
    }

    res.status(201).json({ id, conviteEnviado });
  } catch (erro) {
    next(erro);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo) return;

    const dados = {};
    if (req.body.nome !== undefined) {
      const nome = limparNome(req.body.nome);
      if (!nome) return res.status(400).json({ erro: "dados_invalidos" });
      dados.nome = nome;
    }
    if (req.body.papel !== undefined && req.body.papel !== alvo.papel) {
      if (!PAPEIS.includes(req.body.papel)) return res.status(400).json({ erro: "dados_invalidos" });
      if (ehOProprio(req, res, alvo)) return;
      dados.papel = req.body.papel;
    }

    if (Object.keys(dados).length > 0) {
      verificar(await supabase.from("usuarios").update(dados).eq("id", alvo.id).eq("empresa_id", req.usuario.empresaId).select("id"));
    }
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/desativar", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo || ehOProprio(req, res, alvo)) return;

    verificar(await supabase.from("usuarios").update({ ativo: false }).eq("id", alvo.id).eq("empresa_id", req.usuario.empresaId).select("id"));

    // os atendimentos em andamento dessa pessoa voltam para a fila
    const devolvidos = verificar(
      await supabase
        .from("chamados")
        .update({ status: "aguardando_humano", atendente_id: null, atualizado_em: agora() })
        .eq("empresa_id", req.usuario.empresaId)
        .eq("atendente_id", alvo.id)
        .eq("status", "em_atendimento_humano")
        .select("id")
    );

    // a sessão já é barrada na próxima requisição (usuário inativo); o tempo real cai agora
    encerrarConexoesDoUsuario(alvo.id);

    res.json({ ok: true, devolvidos: devolvidos.length });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/reativar", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo) return;
    verificar(await supabase.from("usuarios").update({ ativo: true }).eq("id", alvo.id).eq("empresa_id", req.usuario.empresaId).select("id"));
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/convite", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo) return;
    if (!alvo.ativo) return res.status(409).json({ erro: "desativado" });
    if (!(await nuncaEntrou(alvo.id))) return res.status(409).json({ erro: "ja_acessou" });

    try {
      await enviarLinkSenha(alvo.id, "convite");
    } catch (erro) {
      console.error("Erro ao reenviar convite:", erro.message || erro);
      return res.status(502).json({ erro: "falha_email" });
    }
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

router.post("/:id/redefinir-senha", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo) return;
    if (!alvo.ativo) return res.status(409).json({ erro: "desativado" });

    try {
      await enviarLinkSenha(alvo.id, "redefinicao");
    } catch (erro) {
      console.error("Erro ao enviar link de senha:", erro.message || erro);
      return res.status(502).json({ erro: "falha_email" });
    }
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

// só quem nunca entrou e não aparece em nenhum histórico; os demais são desativados
router.delete("/:id", async (req, res, next) => {
  try {
    const alvo = await carregarAlvo(req, res);
    if (!alvo || ehOProprio(req, res, alvo)) return;
    if (!(await nuncaEntrou(alvo.id))) return res.status(409).json({ erro: "em_uso" });

    const contagens = await Promise.all(
      ["mensagens", "eventos_chamado", "chamados"].map((tabela) =>
        supabase.from(tabela).select("id", { count: "exact", head: true }).eq("atendente_id", alvo.id)
      )
    );
    for (const { error } of contagens) if (error) throw error;
    if (contagens.some(({ count }) => count > 0)) return res.status(409).json({ erro: "em_uso" });

    const { error: erroPerfil } = await supabase.from("usuarios").delete().eq("id", alvo.id).eq("empresa_id", req.usuario.empresaId);
    if (erroPerfil && erroPerfil.code === "23503") return res.status(409).json({ erro: "em_uso" });
    if (erroPerfil) throw erroPerfil;

    const { error: erroLogin } = await supabase.auth.admin.deleteUser(alvo.id);
    if (erroLogin) throw erroLogin;

    res.status(204).end();
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;