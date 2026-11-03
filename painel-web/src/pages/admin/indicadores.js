import { duracao } from "../../lib/formatos";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const dolar = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dolarFino = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const inteiro = new Intl.NumberFormat("pt-BR");

export function hoje() {
  return formatoDia.format(new Date()); // AAAA-MM-DD em Brasília
}

export function somarDias(dia, quantidade) {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return data.toISOString().slice(0, 10);
}

// todos os dias do período, inclusive os sem dados (que viram zero)
export function preencherDias(de, ate, lista, campos) {
  const porDia = new Map((lista || []).map((item) => [item.dia, item]));
  const dias = [];
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    const item = porDia.get(dia) || {};
    dias.push({ dia, ...Object.fromEntries(campos.map((campo) => [campo, Number(item[campo]) || 0])) });
  }
  return dias;
}

export function rotuloDiaCurto(dia) {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

export function formatarDolar(valor) {
  const numero = Number(valor) || 0;
  return numero > 0 && numero < 1 ? dolarFino.format(numero) : dolar.format(numero);
}

export function formatarInteiro(valor) {
  return inteiro.format(Number(valor) || 0);
}

export function porcentagem(parte, total) {
  return total ? `${Math.round((parte / total) * 100)}%` : "—";
}

export function formatarMinutos(valor) {
  if (valor === null || valor === undefined) return "—";
  return valor < 1 ? "< 1 min" : duracao(Math.round(valor));
}

// CSV com ";" e BOM: abre direto no Excel em português, com vírgula decimal
export function baixarCsv(nome, colunas, linhas) {
  const escapar = (valor) => {
    if (valor === null || valor === undefined) return "";
    const texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
    return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const conteudo = [
    colunas.map((coluna) => escapar(coluna.rotulo)).join(";"),
    ...linhas.map((linha) => colunas.map((coluna) => escapar(coluna.valor(linha))).join(";")),
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nome}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}