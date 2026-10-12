import { useId } from "react";

export default function Campo({ rotulo, ajuda, invalido, ...props }) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;

  return (
    <div className="pa-campo">
      <label htmlFor={id} className="pa-campo__rotulo">{rotulo}</label>
      <input
        id={id}
        className={`pa-campo__input${invalido ? " pa-campo__input--invalido" : ""}`}
        aria-invalid={invalido || undefined}
        aria-describedby={ajuda ? idAjuda : undefined}
        {...props}
      />
      {ajuda && <p id={idAjuda} className="pa-campo__ajuda">{ajuda}</p>}
    </div>
  );
}