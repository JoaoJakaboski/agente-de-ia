import { useState } from "react";
import { api } from "../../lib/api";
import { formatarTelefone } from "../../lib/formatos";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";

const ERROS = {
  chamado_aberto: "Esse cliente está com um atendimento em andamento. Encerre o atendimento antes de excluir.",
  somente_admin: "Só administradores podem excluir clientes.",
};

export default function ModalExcluirCliente({ cliente, aoFechar }) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState(cliente.chamado_aberto_id ? ERROS.chamado_aberto : null);
  const identificacao = cliente.nome || formatarTelefone(cliente.telefone);
  const total = Number(cliente.total_chamados) || 0;

  async function excluir() {
    if (excluindo) return;
    setExcluindo(true);
    try {
      await api(`/clientes/${cliente.id}`, { metodo: "DELETE" });
      aoFechar(true);
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível excluir. Tente de novo.");
      setExcluindo(false);
    }
  }

  return (
    <Modal
      titulo="Excluir cliente?"
      aoFechar={() => aoFechar(Boolean(erro))}
      rodape={
        <>
          <Botao onClick={() => aoFechar(Boolean(erro))}>Cancelar</Botao>
          <Botao variante="perigo-solido" icone={<Icone nome="lixeira" />}
            disabled={excluindo || Boolean(cliente.chamado_aberto_id)} onClick={excluir}>
            {excluindo ? "Excluindo…" : "Excluir cliente"}
          </Botao>
        </>
      }
    >
      <p>
        Isso apaga <strong>{identificacao}</strong> e todo o histórico:{" "}
        {total === 1 ? "1 chamado" : `${total} chamados`} e as mensagens trocadas. Não dá para desfazer.
      </p>
      <p className="pa-campo__ajuda">
        Se essa pessoa mandar mensagem de novo, ela volta como um cliente novo, sem nome. O consumo de IA desses
        chamados continua nos números de custo, sem ligação com o cliente.
      </p>

      {erro && (
        <p className="pa-alert pa-alert--error" role="alert">
          <Icone nome="alerta" />
          {erro}
        </p>
      )}
    </Modal>
  );
}