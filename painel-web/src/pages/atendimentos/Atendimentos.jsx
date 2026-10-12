import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import { useEventos } from "../../lib/tempoReal";
import ListaChamados from "./ListaChamados";
import Conversa from "./Conversa";
import DetalhesChamado from "./DetalhesChamado";
import "./Atendimentos.css";

export default function Atendimentos() {
  const { chamadoId } = useParams();
  const navegar = useNavigate();
  const [fila, setFila] = useState("aguardando");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const timers = useRef({});

  // espera o atendente parar de digitar antes de buscar
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(timer);
  }, [busca]);

  const lista = useRecurso(() => {
    const parametros = new URLSearchParams({ fila });
    if (buscaAplicada) parametros.set("busca", buscaAplicada);
    return api(`/chamados?${parametros}`).then((dados) => dados.chamados);
  }, [fila, buscaAplicada]);

  const detalhe = useRecurso(
    () => (chamadoId ? api(`/chamados/${chamadoId}`).then((dados) => dados.chamado) : Promise.resolve(null)),
    [chamadoId]
  );

  const conversa = useRecurso(
    () => (chamadoId ? api(`/chamados/${chamadoId}/mensagens`) : Promise.resolve(null)),
    [chamadoId]
  );

  function agendar(chave, acao) {
    clearTimeout(timers.current[chave]);
    timers.current[chave] = setTimeout(acao, 300);
  }

  // ação no chamado aberto; recarrega na hora, sem esperar o aviso do tempo real
  async function executarAcao(caminho, corpo) {
    try {
      return await api(`/chamados/${chamadoId}/${caminho}`, { metodo: "POST", corpo });
    } finally {
      detalhe.recarregar();
      conversa.recarregar();
      lista.recarregar();
    }
  }

  useEventos((tipo, dados) => {
    agendar("lista", lista.recarregar);
    if (tipo === "reconectado" || (dados && dados.chamadoId === chamadoId)) {
      agendar("chamado", () => {
        detalhe.recarregar();
        conversa.recarregar();
      });
    }
  });

  const classes = [
    "atend",
    chamadoId && "atend--com-chamado",
    detalhesAbertos && "atend--detalhes-abertos",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <ListaChamados
        fila={fila}
        aoTrocarFila={setFila}
        busca={busca}
        aoBuscar={setBusca}
        lista={lista}
        selecionadoId={chamadoId}
        aoSelecionar={(id) => {
          setDetalhesAbertos(false);
          navegar(`/atendimentos/${id}`);
        }}
      />
      <Conversa
        key={chamadoId || "nenhum"}
        chamadoId={chamadoId}
        detalhe={detalhe}
        conversa={conversa}
        aoVoltar={() => navegar("/atendimentos")}
        aoAbrirDetalhes={() => setDetalhesAbertos(true)}
        executarAcao={executarAcao}
        aoAssumir={() => setFila("meus")}
      />
      {chamadoId && <DetalhesChamado detalhe={detalhe} aoFechar={() => setDetalhesAbertos(false)} />}
    </div>
  );
}