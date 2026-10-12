import { useEffect, useId, useRef, useState } from "react";
import Icone from "./Icone";

export function Menu({ rotuloBotao, conteudoBotao, classeBotao, alinhar = "fim", children }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);
  const lista = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;

    function itens() {
      return [...lista.current.querySelectorAll('[role^="menuitem"]')];
    }

    function cliqueFora(evento) {
      if (!raiz.current.contains(evento.target)) setAberto(false);
    }

    function teclado(evento) {
      if (evento.key === "Escape") {
        setAberto(false);
        raiz.current.querySelector("button").focus();
      }
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        evento.preventDefault();
        const todos = itens();
        const atual = todos.indexOf(document.activeElement);
        const passo = evento.key === "ArrowDown" ? 1 : -1;
        todos[(atual + passo + todos.length) % todos.length].focus();
      }
    }

    document.addEventListener("mousedown", cliqueFora);
    document.addEventListener("keydown", teclado);
    const primeiro = itens()[0];
    if (primeiro) primeiro.focus();

    return () => {
      document.removeEventListener("mousedown", cliqueFora);
      document.removeEventListener("keydown", teclado);
    };
  }, [aberto]);

  function aoClicarNaLista(evento) {
    if (evento.target.closest('[role^="menuitem"]')) setAberto(false);
  }

  return (
    <div className="pa-menu" ref={raiz}>
      <button
        type="button"
        className={classeBotao}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        aria-label={rotuloBotao}
        onClick={() => setAberto((valor) => !valor)}
      >
        {conteudoBotao}
      </button>
      {aberto && (
        <div id={id} role="menu" ref={lista} className={`pa-menu__lista pa-menu__lista--${alinhar}`} onClick={aoClicarNaLista}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ItemMenu({ icone, perigo, onSelect, children }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={`pa-menu__item${perigo ? " pa-menu__item--perigo" : ""}`} onClick={onSelect}>
      {icone}
      <span className="pa-menu__texto">{children}</span>
    </button>
  );
}

export function ItemMenuRadio({ icone, marcado, onSelect, children }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={marcado} tabIndex={-1} className="pa-menu__item" onClick={onSelect}>
      {icone}
      <span className="pa-menu__texto">{children}</span>
      {marcado && <Icone nome="check" />}
    </button>
  );
}

export function GrupoMenu({ rotulo, children }) {
  return (
    <div role="group" aria-label={rotulo}>
      <p className="pa-menu__grupo" aria-hidden="true">{rotulo}</p>
      {children}
    </div>
  );
}

export function SeparadorMenu() {
  return <div role="separator" className="pa-menu__separador" />;
}