import { useEffect, useId, useRef } from "react";

export default function Modal({ titulo, children, rodape, aoFechar }) {
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
      className="pa-modal"
      aria-labelledby={idTitulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onClick={(evento) => {
        // clique no fundo escurecido fecha
        if (evento.target === dialogo.current) aoFechar();
      }}
    >
      <div className="pa-modal__bd">
        <h2 id={idTitulo} className="pa-modal__titulo">{titulo}</h2>
        {children}
      </div>
      <div className="pa-modal__ft">{rodape}</div>
    </dialog>
  );
}