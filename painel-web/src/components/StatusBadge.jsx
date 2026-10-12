import Icone from "./Icone";
import { STATUS } from "../lib/formatos";

export default function StatusBadge({ status, pequeno }) {
  const dados = STATUS[status] || { rotulo: status, icone: "info" };
  return (
    <span className={`pa-status pa-status--${status}${pequeno ? " pa-status--sm" : ""}`}>
      <Icone nome={dados.icone} />
      {dados.rotulo}
    </span>
  );
}