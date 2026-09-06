const CLASSIFICADOR_URL = process.env.CLASSIFICADOR_URL || "http://localhost:5001";
const TIMEOUT_MS = 5000;

// consulta o microsserviço Python; retorna { intencao, confianca } ou null se falhar/travar
async function classificarIntencao(empresaSlug, texto) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${CLASSIFICADOR_URL}/classificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: empresaSlug, texto }),
      signal: controller.signal,
    });

    if (!resposta.ok) {
      console.error("classificador retornou erro:", resposta.status);
      return null;
    }

    return await resposta.json();
  } catch (erro) {
    if (erro.name === "AbortError") {
      console.error("classificador demorou demais pra responder");
    } else {
      console.error("erro ao consultar o classificador:", erro.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { classificarIntencao };
