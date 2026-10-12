import Icone from "../../components/Icone";
import StatusBadge from "../../components/StatusBadge";
import AssuntoTag from "../../components/AssuntoTag";
import { duracao, formatarTelefone, horaCurta, minutosDesde, previaMensagem } from "../../lib/formatos";

export default function ItemChamado({ chamado, selecionado, agora, onClick }) {
  const nome = chamado.nome_cliente || formatarTelefone(chamado.telefone_cliente);
  const aguardando = chamado.status === "aguardando_humano";
  const espera = aguardando ? minutosDesde(chamado.status_desde || chamado.atualizado_em, agora) : null;

  return (
    <button type="button" className="pa-item" aria-current={selecionado ? "true" : undefined} onClick={onClick}>
      <span className="pa-item__name">{nome}</span>
      <span className="pa-item__time">{horaCurta(chamado.ultima_mensagem_em || chamado.atualizado_em, agora)}</span>
      <span className="pa-item__prev">{previaMensagem(chamado)}</span>
      <span className="pa-item__tags">
        <StatusBadge status={chamado.status} pequeno />
        {chamado.assunto && <AssuntoTag assunto={chamado.assunto} />}
        {aguardando && (
          <span className="pa-wait">
            <Icone nome="relogio" />
            há {duracao(espera)}
          </span>
        )}
      </span>
    </button>
  );
}