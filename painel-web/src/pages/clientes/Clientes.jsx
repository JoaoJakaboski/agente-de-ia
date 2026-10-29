import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useEventos } from "../../lib/tempoReal";
import { dataHora, formatarTelefone } from "../../lib/formatos";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";
import StatusBadge from "../../components/StatusBadge";
import { EstadoErro, EstadoVazio, Esqueleto } from "../../components/Estados";
import ModalCliente from "./ModalCliente";
import ModalNovaConversa from "./ModalNovaConversa";
import { useSessao } from "../../lib/sessao";
import ModalExcluirCliente from "./ModalExcluirCliente";
import "../admin/admin.css";
import "./Clientes.css";

const TAMANHO_PAGINA = 30;

function useListaClientes(busca) {
  const [estado, setEstado] = useState({ status: "carregando", clientes: [], temMais: false });
  const versao = useRef(0);
  const quantidade = useRef(0);

  // modo "inicial" limpa a tela; "mais" soma a próxima página; "recarga" atualiza o que já está na tela
  const carregar = useCallback(async (modo) => {
    const minhaVersao = ++versao.current;
    const deslocamento = modo === "mais" ? quantidade.current : 0;
    const limite = modo === "recarga" ? Math.max(TAMANHO_PAGINA, quantidade.current) : TAMANHO_PAGINA;
    if (modo === "inicial") setEstado({ status: "carregando", clientes: [], temMais: false });

    try {
      const parametros = new URLSearchParams({ busca, deslocamento: String(deslocamento), limite: String(limite) });
      const dados = await api(`/clientes?${parametros}`);
      if (minhaVersao !== versao.current) return;

      setEstado((atual) => {
        const clientes = modo === "mais" ? [...atual.clientes, ...dados.clientes] : dados.clientes;
        quantidade.current = clientes.length;
        return { status: "ok", clientes, temMais: dados.temMais };
      });
    } catch {
      if (minhaVersao !== versao.current) return;
      setEstado((atual) => (modo !== "inicial" && atual.status === "ok" ? atual : { status: "erro", clientes: [], temMais: false }));
    }
  }, [busca]);

  useEffect(() => {
    carregar("inicial");
  }, [carregar]);

  return {
    ...estado,
    carregarMais: () => carregar("mais"),
    recarregar: () => carregar("recarga"),
  };
}

export default function Clientes() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [modal, setModal] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const espera = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(espera);
  }, [busca]);

  const lista = useListaClientes(buscaAplicada);

  // chamados novos ou encerrados mudam o total, a data e a conversa aberta de cada cliente
  useEventos((tipo) => {
    if (tipo !== "chamado" && tipo !== "reconectado") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(lista.recarregar, 500);
  });

  function fecharModal(recarregar) {
    setModal(null);
    if (recarregar) lista.recarregar();
  }

  function conteudo() {
    if (lista.status === "carregando") return <Esqueleto linhas={6} />;
    if (lista.status === "erro") {
      return <EstadoErro titulo="Não foi possível carregar os clientes" aoTentar={lista.recarregar} />;
    }
    if (lista.clientes.length === 0) {
      return buscaAplicada ? (
        <EstadoVazio icone="busca" titulo="Nada encontrado" texto="Nenhum cliente com esse nome ou telefone." />
      ) : (
        <EstadoVazio
          icone="pessoa"
          titulo="Nenhum cliente ainda"
          texto="Quem mandar mensagem para a empresa aparece aqui automaticamente."
          acao={<Botao variante="primario" icone={<Icone nome="mais" />} onClick={() => setModal({ tipo: "cliente" })}>Novo cliente</Botao>}
        />
      );
    }

    return (
      <div className="pa-card admin__tabela">
        <table className="pa-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>Chamados</th>
              <th>Último chamado</th>
              <th>Situação</th>
              <th><span className="pa-vh">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.clientes.map((cliente) => (
              <tr key={cliente.id}>
                <td>
                  <span className="clientes__nome">
                    {cliente.nome || <span className="pa-faint">Sem nome</span>}
                    <button type="button" className="pa-iconbtn" aria-label={`Editar nome de ${cliente.nome || "cliente sem nome"}`}
                      onClick={() => setModal({ tipo: "cliente", cliente })}>
                      <Icone nome="editar" />
                    </button>
                    {usuario.papel === "admin" && (
                      <button type="button" className="pa-iconbtn clientes__excluir"
                        aria-label={`Excluir ${cliente.nome || "cliente sem nome"}`}
                        onClick={() => setModal({ tipo: "excluir", cliente })}>
                        <Icone nome="lixeira" />
                      </button>
                    )}
                  </span>
                </td>
                <td className="pa-mono">{formatarTelefone(cliente.telefone)}</td>
                <td>{cliente.total_chamados}</td>
                <td>{dataHora(cliente.ultimo_chamado_em)}</td>
                <td>
                  {cliente.chamado_aberto_status
                    ? <StatusBadge status={cliente.chamado_aberto_status} />
                    : <span className="pa-faint">Sem chamado aberto</span>}
                </td>
                <td className="clientes__acao">
                  {cliente.chamado_aberto_id ? (
                    <Botao icone={<Icone nome="conversa" />} onClick={() => navegar(`/atendimentos/${cliente.chamado_aberto_id}`)}>
                      Abrir conversa
                    </Botao>
                  ) : (
                    <Botao variante="primario" icone={<Icone nome="enviar" />} onClick={() => setModal({ tipo: "conversa", cliente })}>
                      Nova conversa
                    </Botao>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.temMais && (
          <div className="clientes__mais">
            <Botao variante="fantasma" onClick={lista.carregarMais}>Carregar mais</Botao>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pa-page pa-page--fixa">
      <header className="pa-page__hd">
        <div>
          <h1 className="pa-page__title">Clientes</h1>
          <p className="pa-page__sub">Quem já falou com a empresa pelo WhatsApp, e os clientes cadastrados pela equipe.</p>
        </div>
        <Botao variante="primario" icone={<Icone nome="mais" />} onClick={() => setModal({ tipo: "cliente" })}>Novo cliente</Botao>
      </header>

      <div className="admin__filtros">
        <div className="pa-search">
          <Icone nome="busca" />
          <input className="pa-input" type="search" placeholder="Buscar por nome ou telefone"
            aria-label="Buscar clientes" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
        </div>
      </div>

      {conteudo()}

      {modal && modal.tipo === "cliente" && (
        <ModalCliente cliente={modal.cliente} aoFechar={fecharModal} />
      )}
      {modal && modal.tipo === "conversa" && (
        <ModalNovaConversa cliente={modal.cliente} aoFechar={fecharModal} />
      )}
      {modal && modal.tipo === "excluir" && (
        <ModalExcluirCliente cliente={modal.cliente} aoFechar={fecharModal} />
      )}
    </div>
  );
}