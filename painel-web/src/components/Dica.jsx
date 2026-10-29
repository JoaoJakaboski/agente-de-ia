import { useId, useRef, useState } from "react";
import Icone from "./Icone";

const LARGURA = 240;
const MARGEM = 8;
const ESPACO_MINIMO_ACIMA = 120;

// posicionada pela janela, não pelo contêiner: não é cortada por tabelas com rolagem
export default function Dica({ texto, rotulo = "Mais informações" }) {
  const id = useId();
  const botao = useRef(null);
  const [posicao, setPosicao] = useState(null);

  function abrir() {
    const area = botao.current.getBoundingClientRect();
    const esquerda = Math.min(
      Math.max(area.left + area.width / 2 - LARGURA / 2, MARGEM),
      window.innerWidth - LARGURA - MARGEM
    );
    const abaixo = area.top < ESPACO_MINIMO_ACIMA;
    setPosicao({ esquerda, topo: abaixo ? area.bottom + 6 : area.top - 6, abaixo });
  }

  function fechar() {
    setPosicao(null);
  }

  return (
    <span className="pa-tip" onMouseEnter={abrir} onMouseLeave={fechar}>
      <button
        ref={botao}
        type="button"
        className="pa-tip__botao"
        aria-label={rotulo}
        aria-describedby={id}
        onFocus={abrir}
        onBlur={fechar}
        onKeyDown={(evento) => evento.key === "Escape" && fechar()}
      >
        <Icone nome="info" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pa-tip__body"
        hidden={!posicao}
        style={
          posicao
            ? { left: posicao.esquerda, top: posicao.topo, transform: posicao.abaixo ? "none" : "translateY(-100%)" }
            : undefined
        }
      >
        {texto}
      </span>
    </span>
  );
}