import { useId } from "react";

export default function Chave({ rotulo, marcada, aoMudar, desabilitada, rotuloOculto, ajuda }) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;

  return (
    <div className="pa-chave">
      <label className="pa-switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={marcada}
          disabled={desabilitada}
          aria-label={rotuloOculto ? rotulo : undefined}
          aria-describedby={ajuda ? idAjuda : undefined}
          onChange={(evento) => aoMudar(evento.target.checked)}
        />
        <span className="pa-switch__track" aria-hidden="true" />
        {!rotuloOculto && <span className="pa-switch__text">{rotulo}</span>}
      </label>
      {ajuda && <p id={idAjuda} className="pa-campo__ajuda">{ajuda}</p>}
    </div>
  );
}