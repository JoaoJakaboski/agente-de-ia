const express = require("express");
const { supabase } = require("../db/client");
const { exigirSessao } = require("./sessao");

const router = express.Router();
router.use(exigirSessao);
router.use((req, res, next) => {
  if (req.usuario.papel !== "admin") return res.status(403).json({ erro: "somente_admin" });
  next();
});

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const MAXIMO_DIAS = 366;
const FORMATO_MODELO = /^[a-zA-Z0-9._-]{1,80}$/;
const PRECO_MAXIMO = 1000;

function intervalo(de, ate) {
  if (!DATA.test(de || "") || !DATA.test(ate || "")) return null;
  const inicio = new Date(`${de}T00:00:00-03:00`);
  const fim = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + UM_DIA_MS);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  if (fim <= inicio || fim - inicio > MAXIMO_DIAS * UM_DIA_MS) return null;
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

async function chamar(funcao, parametros) {
  const { data, error } = await supabase.rpc(funcao, parametros);
  if (error) throw error;
  return data;
}

router.get("/", async (req, res, next) => {
  try {
    const periodo = intervalo(req.query.de, req.query.ate);
    if (!periodo) return res.status(400).json({ erro: "periodo_invalido" });

    const parametros = { p_empresa_id: req.usuario.empresaId, p_de: periodo.inicio, p_ate: periodo.fim };
    const [funil, ia, atendimento] = await Promise.all([
      chamar("indicadores_funil", parametros),
      chamar("indicadores_ia", parametros),
      chamar("indicadores_atendimento", parametros),
    ]);

    res.json({ funil, ia, atendimento });
  } catch (erro) {
    next(erro);
  }
});

router.get("/precos", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("precos_modelo")
      .select("modelo, preco_entrada_mtok, preco_saida_mtok, atualizado_em")
      .eq("empresa_id", req.usuario.empresaId)
      .order("modelo");
    if (error) throw error;
    res.json({ precos: data });
  } catch (erro) {
    next(erro);
  }
});

router.put("/precos", async (req, res, next) => {
  try {
    const lista = Array.isArray(req.body.precos) ? req.body.precos : null;
    if (!lista || lista.length > 50) return res.status(400).json({ erro: "dados_invalidos" });

    const momento = new Date().toISOString();
    const linhas = [];
    for (const item of lista) {
      const entrada = Number(item && item.entrada);
      const saida = Number(item && item.saida);
      const valido =
        item && typeof item.modelo === "string" && FORMATO_MODELO.test(item.modelo) &&
        Number.isFinite(entrada) && entrada >= 0 && entrada <= PRECO_MAXIMO &&
        Number.isFinite(saida) && saida >= 0 && saida <= PRECO_MAXIMO;
      if (!valido) return res.status(400).json({ erro: "dados_invalidos" });

      linhas.push({
        empresa_id: req.usuario.empresaId,
        modelo: item.modelo,
        preco_entrada_mtok: entrada,
        preco_saida_mtok: saida,
        atualizado_em: momento,
      });
    }

    if (linhas.length > 0) {
      const { error } = await supabase.from("precos_modelo").upsert(linhas, { onConflict: "empresa_id,modelo" });
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;