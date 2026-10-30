import { useState } from "react";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import { dataHora } from "../../lib/formatos";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";
import Modal from "../../components/Modal";
import { Menu, ItemMenu, SeparadorMenu } from "../../components/Menu";
import { EstadoErro, Esqueleto } from "../../components/Estados";
import ModalAtendente from "./ModalAtendente";
import "./admin.css";

const PAPEIS = { admin: "Administrador", atendente: "Atendente" };
const SITUACOES = { ativo: "Ativo", pendente: "Convite pendente", desativado: "Desativado" };

const CAMINHOS = {
  desativar: { caminho: "/desativar", metodo: "POST" },
  reativar: { caminho: "/reativar", metodo: "POST" },
  convite: { caminho: "/convite", metodo: "POST" },
  senha: { caminho: "/redefinir-senha", metodo: "POST" },
  excluir: { caminho: "", metodo: "DELETE" },
};

const SUCESSOS = {
  desativar: (u, r) => {
    const n = (r && r.devolvidos) || 0;
    const fila = n === 0 ? "" : n === 1 ? " 1 atendimento voltou para a fila." : ` ${n} atendimentos voltaram para a fila.`;
    return `${u.nome} foi desativado.${fila}`;
  },
  reativar: (u) => `${u.nome} foi reativado.`,
  convite: (u) => `Convite reenviado para ${u.email}.`,
  senha: (u) => `Link para criar senha nova enviado para ${u.email}.`,
  excluir: (u) => `O convite de ${u.nome} foi cancelado.`,
};

const ERROS = {
  proprio_usuario: "Você não pode fazer isso com o seu próprio usuário.",
  em_uso: "Essa pessoa já entrou no painel ou aparece em atendimentos. Desative em vez de excluir.",
  ja_acessou: "Essa pessoa já entrou no painel. Use “Enviar link de senha”.",
  desativado: "Reative o usuário antes.",
  falha_email: "Não foi possível enviar o e-mail agora. Tente de novo.",
};

function textoConfirmacao(acao, usuario) {
  if (acao === "excluir") {
    return `O convite de ${usuario.nome} é cancelado e o usuário é apagado. Só é possível porque essa pessoa nunca entrou no painel.`;
  }
  const n = Number(usuario.em_andamento) || 0;
  const fila = n === 0 ? "" : n === 1
    ? " O atendimento em andamento dela volta para “Aguardando atendente”."
    : ` Os ${n} atendimentos em andamento dela voltam para “Aguardando atendente”.`;
  return `${usuario.nome} perde o acesso ao painel na hora.${fila} Dá para reativar depois.`;
}

export default function Atendentes() {
  const recurso = useRecurso(() => api("/admin/usuarios").then((dados) => dados.usuarios), []);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao, usuario) {
    setOcupado(true);
    setAviso(null);
    try {
      const { caminho, metodo } = CAMINHOS[acao];
      const resposta = await api(`/admin/usuarios/${usuario.id}${caminho}`, { metodo });
      setAviso({ tipo: "ok", texto: SUCESSOS[acao](usuario, resposta) });
      recurso.recarregar();
    } catch (falha) {
      setAviso({ tipo: "erro", texto: ERROS[falha.codigo] || "Não foi possível concluir. Tente de novo." });
    } finally {
      setOcupado(false);
      setModal(null);
    }
  }

  function aoFecharCadastro(resultado) {
    setModal(null);
    if (!resultado) return;
    recurso.recarregar();
    if (resultado.conviteEnviado === false) {
      setAviso({ tipo: "erro", texto: "O usuário foi criado, mas o e-mail de convite não saiu. Use “Reenviar convite”." });
    } else {
      setAviso({ tipo: "ok", texto: resultado.mensagem });
    }
  }

  function acoes(usuario) {
    return (
      <Menu classeBotao="pa-iconbtn" conteudoBotao={<Icone nome="opcoes" />}>
        <ItemMenu icone={<Icone nome="editar" />} onSelect={() => setModal({ tipo: "cadastro", usuario })}>Editar</ItemMenu>
        {usuario.situacao === "pendente" && (
          <ItemMenu icone={<Icone nome="enviar" />} onSelect={() => executar("convite", usuario)}>Reenviar convite</ItemMenu>
        )}
        {usuario.situacao === "ativo" && (
          <ItemMenu icone={<Icone nome="cadeado" />} onSelect={() => executar("senha", usuario)}>Enviar link de senha</ItemMenu>
        )}
        {usuario.situacao === "desativado" && (
          <ItemMenu icone={<Icone nome="atualizar" />} onSelect={() => executar("reativar", usuario)}>Reativar</ItemMenu>
        )}
        {!usuario.voce && usuario.ativo && (
          <>
            <SeparadorMenu />
            <ItemMenu icone={<Icone nome="encerrar" />} perigo onSelect={() => setModal({ tipo: "confirmar", acao: "desativar", usuario })}>
              Desativar
            </ItemMenu>
          </>
        )}
        {!usuario.voce && usuario.situacao === "pendente" && (
          <ItemMenu icone={<Icone nome="lixeira" />} perigo onSelect={() => setModal({ tipo: "confirmar", acao: "excluir", usuario })}>
            Excluir convite
          </ItemMenu>
        )}
      </Menu>
    );
  }

  function conteudo() {
    if (recurso.status === "carregando") return <Esqueleto linhas={4} />;
    if (recurso.status === "erro") {
      return <EstadoErro titulo="Não foi possível carregar os atendentes" aoTentar={recurso.recarregar} />;
    }

    return (
      <div className="pa-card admin__tabela">
        <table className="pa-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Situação</th>
              <th>Último acesso</th>
              <th>Em atendimento</th>
              <th><span className="pa-vh">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {recurso.dados.map((usuario) => (
              <tr key={usuario.id} className={usuario.ativo ? undefined : "admin__inativa"}>
                <td>
                  {usuario.nome}
                  {usuario.voce && <span className="pa-tag-int atendentes__voce">Você</span>}
                </td>
                <td>{usuario.email}</td>
                <td>{PAPEIS[usuario.papel] || usuario.papel}</td>
                <td><span className={`atendentes__situacao atendentes__situacao--${usuario.situacao}`}>{SITUACOES[usuario.situacao]}</span></td>
                <td>{usuario.ultimo_acesso ? dataHora(usuario.ultimo_acesso) : <span className="pa-faint">Nunca</span>}</td>
                <td>{Number(usuario.em_andamento) || <span className="pa-faint">—</span>}</td>
                <td className="atendentes__acoes">{acoes(usuario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="pa-page pa-page--fixa">
      <header className="pa-page__hd">
        <div>
          <h1 className="pa-page__title">Atendentes</h1>
          <p className="pa-page__sub">Quem acessa o painel da empresa. Novos atendentes recebem um convite por e-mail para criar a senha.</p>
        </div>
        <Botao variante="primario" icone={<Icone nome="mais" />} onClick={() => setModal({ tipo: "cadastro" })}>Convidar atendente</Botao>
      </header>

      {aviso && (
        <p className={`pa-alert ${aviso.tipo === "erro" ? "pa-alert--error" : "pa-alert--info"} admin__aviso`} role={aviso.tipo === "erro" ? "alert" : "status"}>
          <Icone nome={aviso.tipo === "erro" ? "alerta" : "checkCirculo"} />
          {aviso.texto}
        </p>
      )}

      {conteudo()}

      {modal && modal.tipo === "cadastro" && (
        <ModalAtendente usuario={modal.usuario} aoFechar={aoFecharCadastro} />
      )}

      {modal && modal.tipo === "confirmar" && (
        <Modal
          titulo={modal.acao === "excluir" ? "Excluir convite?" : `Desativar ${modal.usuario.nome}?`}
          aoFechar={() => setModal(null)}
          rodape={
            <>
              <Botao onClick={() => setModal(null)}>Cancelar</Botao>
              <Botao variante="perigo-solido" disabled={ocupado} onClick={() => executar(modal.acao, modal.usuario)}>
                {modal.acao === "excluir" ? "Excluir convite" : "Desativar"}
              </Botao>
            </>
          }
        >
          <p>{textoConfirmacao(modal.acao, modal.usuario)}</p>
        </Modal>
      )}
    </div>
  );
}