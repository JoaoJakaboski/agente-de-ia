import { rotuloAssunto } from "../lib/formatos";

export default function AssuntoTag({ assunto }) {
  const rotulo = rotuloAssunto(assunto);
  return <span className="pa-assunto" title={`Assunto: ${rotulo}`}>{rotulo}</span>;
}