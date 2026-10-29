import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useSessao } from "../../lib/sessao";
import { formatarTelefone } from "../../lib/formatos";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";

const LIMITE_TEXTO = 4000;

const ERROS = {
  chamado_aberto: "Esse cliente já tem um atendimento em andamento. Feche esta janela e use “Abrir conversa”.",
  falha_envio: "A mensagem não chegou ao WhatsApp do cliente. Confira o número e tente de novo.",
  dados_invalidos: "Escreva a mensagem antes de enviar.",
};

export default function ModalNovaConversa({ cliente, aoFechar }) {
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const primeiroNome = String(usuario.nome || "").trim().split(/\s+/)[0] || "Atendente";

  async function enviar() {
    if (enviando || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const { chamadoId } = await api(`/clientes/${cliente.id}/conversa`, { metodo: "POST", corpo: { texto } });
      navegar(`/atendimentos/${chamadoId}`, { state: { fila: "meus" } });
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível iniciar a conversa. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={`Nova conversa com ${cliente.nome || formatarTelefone(cliente.telefone)}`}
      aoFechar={() => aoFechar(Boolean(erro))}
      rodape={
        <>
          <Botao onClick={() => aoFechar(Boolean(erro))}>Cancelar</Botao>
          <Botao variante="primario" icone={<Icone nome="enviar" />} disabled={enviando || !texto.trim()} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar e abrir conversa"}
          </Botao>
        </>
      }
    >
      <div className="pa-campo">
        <label htmlFor="nova-conversa-texto" className="pa-campo__rotulo">Mensagem</label>
        <textarea
          id="nova-conversa-texto"
          className="pa-textarea"
          rows={4}
          maxLength={LIMITE_TEXTO}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          autoFocus
        />
      </div>

      <div className="pa-alert">
        <Icone nome="info" />
        <span>O cliente recebe a mensagem como “*{primeiroNome}:* …”. O atendimento fica com você, e o bot não responde nessa conversa.</span>
      </div>

      {erro && (
        <p className="pa-alert pa-alert--error" role="alert">
          <Icone nome="alerta" />
          {erro}
        </p>
      )}
    </Modal>
  );
}