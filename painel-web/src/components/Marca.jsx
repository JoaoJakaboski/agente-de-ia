import Icone from "./Icone";

export default function Marca({ texto, invertida }) {
  return (
    <span className={`marca${invertida ? " marca--invertida" : ""}`}>
      <span className="marca__quadrado" aria-hidden="true">
        <Icone nome="conversa" />
      </span>
      {texto && <span>{texto}</span>}
    </span>
  );
}