import { useState } from "react";
import { api } from "../lib/api";
import Modal from "./Modal";
import Botao from "./Botao";
import Campo from "./Campo";

const SENHA_MIN = 8;

const ERROS = {
  senha_atual_incorreta: "A senha atual não confere.",
  senha_invalida: "A senha nova não foi aceita. Use pelo menos 8 caracteres e evite senhas muito comuns.",
  muitas_tentativas: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
};

export default function ModalAlterarSenha({ aoFechar }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [concluido, setConcluido] = useState(false);

  const curta = nova.length > 0 && nova.length < SENHA_MIN;
  const diferentes = confirmacao.length > 0 && nova !== confirmacao;
  const valido = atual && nova.length >= SENHA_MIN && nova === confirmacao;

  async function salvar(evento) {
    evento.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api("/auth/alterar-senha", { metodo: "POST", corpo: { senhaAtual: atual, novaSenha: nova } });
      setConcluido(true);
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível alterar a senha. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <Modal titulo="Senha alterada" aoFechar={aoFechar} rodape={<Botao variante="primario" onClick={aoFechar}>Fechar</Botao>}>
        <p>Pronto. Se você estava logado em outro navegador ou aparelho, vai precisar entrar de novo por lá.</p>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Alterar senha"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form="form-alterar-senha" variante="primario" disabled={!valido || enviando}>
            {enviando ? "Salvando…" : "Salvar senha"}
          </Botao>
        </>
      }
    >
      <form id="form-alterar-senha" className="clientes__form" onSubmit={salvar}>
        {erro && <p role="alert" className="pa-alerta pa-alerta--erro">{erro}</p>}
        <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={atual}
          onChange={(e) => setAtual(e.target.value)} autoFocus />
        <Campo rotulo="Senha nova" type="password" autoComplete="new-password" value={nova}
          onChange={(e) => setNova(e.target.value)} invalido={curta} ajuda={`Pelo menos ${SENHA_MIN} caracteres.`} />
        <Campo rotulo="Repita a senha nova" type="password" autoComplete="new-password" value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)} invalido={diferentes}
          ajuda={diferentes ? "As senhas não são iguais." : undefined} />
      </form>
    </Modal>
  );
}