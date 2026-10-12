export class ErroApi extends Error {
  constructor(status, codigo) {
    super(codigo);
    this.status = status;
    this.codigo = codigo;
  }
}

export async function api(caminho, { metodo = "GET", corpo } = {}) {
  const leitura = metodo === "GET";

  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    credentials: "same-origin",
    headers: leitura ? undefined : { "Content-Type": "application/json" },
    body: leitura ? undefined : JSON.stringify(corpo || {}),
  });

  if (resposta.status === 204) return null;

  if (resposta.status === 401 && !caminho.startsWith("/auth/")) {
    window.dispatchEvent(new Event("pa:sessao-expirada"));
  }
  
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroApi(resposta.status, dados.erro || "erro_desconhecido");
  return dados;
}