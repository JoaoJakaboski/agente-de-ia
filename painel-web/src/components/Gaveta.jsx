import { useEffect, useId, useRef } from "react";
import Icone from "./Icone";

export default function Gaveta({ titulo, children, rodape, aoFechar }) {
  const dialogo = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    elemento.showModal();
    return () => elemento.close();
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="pa-gaveta"
      aria-labelledby={idTitulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onClick={(evento) => {
        if (evento.target === dialogo.current) aoFechar();
      }}
    >
      <div className="pa-drawer__hd">
        <h2 id={idTitulo} className="pa-modal__titulo">{titulo}</h2>
        <button type="button" className="pa-iconbtn" aria-label="Fechar" onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      </div>
      <div className="pa-drawer__bd">{children}</div>
      <div className="pa-drawer__ft">{rodape}</div>
    </dialog>
  );
}