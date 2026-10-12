import { useState } from "react";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";

const MOTIVOS = [
  { valor: "resolvido_humano", rotulo: "Resolvido", ajuda: "A dúvida foi respondida ou o pedido foi concluído." },
  { valor: "abandonado", rotulo: "Sem resposta do cliente", ajuda: "O cliente parou de responder." },
  { valor: "fora_do_escopo", rotulo: "Fora do escopo", ajuda: "Pedido que a empresa não atende." },
  { valor: "outro", rotulo: "Outro motivo", ajuda: "Descreva o motivo no campo abaixo." },
];

const MENSAGEM_ENCERRAMENTO = "Seu atendimento foi encerrado. Se precisar de algo, é só mandar uma nova mensagem! 🙂";
const LIMITE_OBSERVACAO = 500;

export default function ModalEncerrar({ ocupado, aoCancelar, aoConfirmar }) {
  const [motivo, setMotivo] = useState(null);
  const [observacao, setObservacao] = useState("");
  const valido = motivo && (motivo !== "outro" || observacao.trim().length > 0);

  return (
    <Modal
      titulo="Encerrar atendimento"
      aoFechar={aoCancelar}
      rodape={
        <>
          <Botao onClick={aoCancelar}>Cancelar</Botao>
          <Botao
            variante="perigo-solido"
            icone={<Icone nome="encerrar" />}
            disabled={!valido || ocupado}
            onClick={() => aoConfirmar({ motivo, observacao: motivo === "outro" ? observacao.trim() : undefined })}
          >
            {ocupado ? "Encerrando…" : "Encerrar atendimento"}
          </Botao>
        </>
      }
    >
      <fieldset className="pa-fieldset">
        <legend className="pa-campo__rotulo">Motivo</legend>
        {MOTIVOS.map((opcao) => (
          <label key={opcao.valor} className="pa-radio">
            <input
              type="radio"
              name="motivo-encerramento"
              value={opcao.valor}
              checked={motivo === opcao.valor}
              onChange={() => setMotivo(opcao.valor)}
            />
            <span>
              <span className="pa-radio__rotulo">{opcao.rotulo}</span>
              <span className="pa-radio__ajuda">{opcao.ajuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {motivo === "outro" && (
        <div className="pa-campo">
          <label htmlFor="observacao-encerramento" className="pa-campo__rotulo">Descreva o motivo</label>
          <textarea
            id="observacao-encerramento"
            className="pa-textarea"
            rows={3}
            maxLength={LIMITE_OBSERVACAO}
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
            autoFocus
          />
          <p className="pa-campo__ajuda">{observacao.length}/{LIMITE_OBSERVACAO}</p>
        </div>
      )}

      <div className="pa-alert">
        <Icone nome="info" />
        <span>O cliente recebe: “{MENSAGEM_ENCERRAMENTO}”</span>
      </div>
    </Modal>
  );
}