import { Fragment } from "react";

const ETIQUETAS = { "*": "strong", _: "em", "~": "s" };

// *negrito*, _itálico_, ~tachado~ e `código`, sem atravessar quebras de linha
const MARCACAO = /(?<![\p{L}\p{N}])([*_~])(?!\1)(?=\S)((?:(?!\1)[^\n])*?\S)\1(?![\p{L}\p{N}])|`([^`\n]+)`/gu;

function formatarTrecho(texto, chave) {
  const partes = [];
  let posicao = 0;

  for (const achado of texto.matchAll(MARCACAO)) {
    if (achado.index > posicao) partes.push(texto.slice(posicao, achado.index));
    const chaveItem = `${chave}-${achado.index}`;

    if (achado[3] !== undefined) {
      partes.push(<code key={chaveItem}>{achado[3]}</code>);
    } else {
      const Etiqueta = ETIQUETAS[achado[1]];
      // o conteúdo pode ter outra marcação dentro: *_assim_*
      partes.push(<Etiqueta key={chaveItem}>{formatarTrecho(achado[2], chaveItem)}</Etiqueta>);
    }
    posicao = achado.index + achado[0].length;
  }

  if (posicao < texto.length) partes.push(texto.slice(posicao));
  return partes;
}

export default function TextoWhatsapp({ texto }) {
  // ```bloco``` primeiro: dentro dele nada é interpretado
  const blocos = String(texto || "").split(/```([\s\S]+?)```/);

  return blocos.map((parte, indice) =>
    indice % 2 === 1 ? (
      <code key={indice} className="pa-code-bloco">{parte}</code>
    ) : (
      <Fragment key={indice}>{formatarTrecho(parte, `t${indice}`)}</Fragment>
    )
  );
}