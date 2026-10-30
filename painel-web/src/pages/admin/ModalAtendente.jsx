import { useState } from "react";
import { api } from "../../lib/api";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Campo from "../../components/Campo";
import Icone from "../../components/Icone";

const ERROS = {
  dados_invalidos: "Confira o nome e o e-mail.",
  email_em_uso: "Já existe um acesso com esse e-mail.",
  proprio_usuario: "Você não pode alterar o seu próprio papel.",
};

export default function ModalAtendente({ usuario, aoFechar }) {
  const novo = !usuario;
  const [nome, setNome] = useState(usuario ? usuario.nome : "");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState(usuario ? usuario.papel : "atendente");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvar(evento) {
    evento.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      if (novo) {
        const resposta = await api("/admin/usuarios", { metodo: "POST", corpo: { nome, email, papel } });
        aoFechar({ conviteEnviado: resposta.conviteEnviado, mensagem: `Convite enviado para ${email.trim()}.` });
      } else {
        await api(`/admin/usuarios/${usuario.id}`, { metodo: "PATCH", corpo: { nome, papel } });
        aoFechar({ mensagem: "Alterações salvas." });
      }
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível salvar. Tente de novo.");
      setSalvando(false);
    }
  }

  const valido = nome.trim() && (!novo || email.trim());

  return (
    <Modal
      titulo={novo ? "Convidar atendente" : "Editar atendente"}
      aoFechar={() => aoFechar(null)}
      rodape={
        <>
          <Botao onClick={() => aoFechar(null)}>Cancelar</Botao>
          <Botao type="submit" form="form-atendente" variante="primario" disabled={!valido || salvando}>
            {salvando ? "Salvando…" : novo ? "Enviar convite" : "Salvar"}
          </Botao>
        </>
      }
    >
      <form id="form-atendente" className="atendentes__form" onSubmit={salvar}>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus />
        {novo ? (
          <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            ajuda="A pessoa recebe um link para criar a senha. Ele vale por 48 horas." />
        ) : (
          <p className="pa-campo__ajuda">E-mail: {usuario.email}</p>
        )}

        <div className="pa-campo">
          <label htmlFor="atendente-papel" className="pa-campo__rotulo">Papel</label>
          <select id="atendente-papel" className="pa-input" value={papel} onChange={(e) => setPapel(e.target.value)}
            disabled={!novo && usuario.voce}>
            <option value="atendente">Atendente</option>
            <option value="admin">Administrador</option>
          </select>
          <p className="pa-campo__ajuda">
            {!novo && usuario.voce
              ? "Você não pode alterar o seu próprio papel."
              : "Administradores também gerenciam regras, o agente e os atendentes, e podem assumir conversas de outros atendentes."}
          </p>
        </div>

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