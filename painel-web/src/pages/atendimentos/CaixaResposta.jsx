import { useLayoutEffect, useRef, useState } from "react";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";

const ALTURA_MAXIMA_PX = 120;

const ERROS = {
  falha_envio: "O WhatsApp não aceitou a mensagem. Tente de novo.",
  nao_e_seu: "Este atendimento não está mais com você.",
};

export default function CaixaResposta({ aoEnviar }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const campo = useRef(null);

  useLayoutEffect(() => {
    const elemento = campo.current;
    elemento.style.height = "auto";
    elemento.style.height = `${Math.min(elemento.scrollHeight, ALTURA_MAXIMA_PX)}px`;
  }, [texto]);

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || enviando) return;

    setEnviando(true);
    setErro(null);
    try {
      await aoEnviar(limpo);
      setTexto("");
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.focus();
    }
  }

  function aoTeclar(evento) {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      enviar();
    }
  }

  return (
    <div>
      {erro && (
        <p className="pa-alert pa-alert--error atend__composer-erro" role="alert">
          <Icone nome="alerta" />
          {erro}
        </p>
      )}
      <div className="pa-composer">
        <textarea
          ref={campo}
          rows={1}
          maxLength={4000}
          placeholder="Escreva sua resposta"
          aria-label="Resposta para o cliente"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={aoTeclar}
        />
        <Botao variante="primario" icone={<Icone nome="enviar" />} disabled={enviando || !texto.trim()} onClick={enviar}>
          {enviando ? "Enviando…" : "Enviar"}
        </Botao>
      </div>
    </div>
  );
}