import { useState } from "react";
import { api } from "../../lib/api";
import { formatarTelefone } from "../../lib/formatos";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Campo from "../../components/Campo";
import Icone from "../../components/Icone";

const ERROS = {
  dados_invalidos: "Confira o nome e o telefone. O telefone precisa ter DDD.",
  sem_whatsapp: "Esse número não tem WhatsApp.",
  cliente_existente: "Já existe um cliente com esse número. Procure por ele na lista.",
  falha_verificacao: "Não foi possível conferir o número no WhatsApp agora. Tente de novo.",
};

export default function ModalCliente({ cliente, aoFechar }) {
  const novo = !cliente;
  const [nome, setNome] = useState(cliente ? cliente.nome || "" : "");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar(evento) {
    evento.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      if (novo) {
        await api("/clientes", { metodo: "POST", corpo: { nome, telefone } });
      } else {
        await api(`/clientes/${cliente.id}`, { metodo: "PATCH", corpo: { nome } });
      }
      aoFechar(true);
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível salvar. Tente de novo.");
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Novo cliente" : "Editar cliente"}
      aoFechar={() => aoFechar(false)}
      rodape={
        <>
          <Botao onClick={() => aoFechar(false)}>Cancelar</Botao>
          <Botao type="submit" form="form-cliente" variante="primario" disabled={salvando || (novo && !telefone.trim())}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </>
      }
    >
      <form id="form-cliente" className="clientes__form" onSubmit={salvar}>
        <Campo rotulo="Nome" value={nome} onChange={(evento) => setNome(evento.target.value)} maxLength={80} autoFocus />
        {novo ? (
          <Campo
            rotulo="Telefone (WhatsApp)"
            ajuda="Com DDD. Ex.: 54 99999-8888. O número é conferido no WhatsApp antes de salvar."
            inputMode="tel"
            value={telefone}
            onChange={(evento) => setTelefone(evento.target.value)}
          />
        ) : (
          <p className="pa-campo__ajuda">Telefone: {formatarTelefone(cliente.telefone)}</p>
        )}
        {erro && (
          <p className="pa-alert pa-alert--error" role="alert">
            <Icone nome="alerta" />
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}