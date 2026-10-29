import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import { useEventos } from "../../lib/tempoReal";
import ListaChamados from "./ListaChamados";
import Conversa from "./Conversa";
import DetalhesChamado from "./DetalhesChamado";
import "./Atendimentos.css";
import { useListaChamados } from "../../lib/useListaChamados";

export default function Atendimentos() {
  const { chamadoId } = useParams();
  const navegar = useNavigate();
  const local = useLocation();
  const [fila, setFila] = useState((local.state && local.state.fila) || "aguardando");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const timers = useRef({});

  // espera o atendente parar de digitar antes de buscar
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(timer);
  }, [busca]);

  const lista = useListaChamados(fila, buscaAplicada);

  const detalhe = useRecurso(
    () => (chamadoId ? api(`/chamados/${chamadoId}`).then((dados) => dados.chamado) : Promise.resolve(null)),
    [chamadoId]
  );

  const conversa = useRecurso(
    () => (chamadoId
      ? api(`/chamados/${chamadoId}/mensagens`).then((dados) => ({ ...dados, chamadoId }))
      : Promise.resolve(null)),
    [chamadoId]
  );

  // enquanto a busca do chamado novo não volta, o useRecurso ainda guarda a resposta do anterior
  const ehDeOutroChamado = (id) => String(id) !== String(chamadoId);
  const detalheAtual = detalhe.dados && ehDeOutroChamado(detalhe.dados.id)
    ? { ...detalhe, dados: null, status: "carregando" }
    : detalhe;
  const conversaAtual = conversa.dados && ehDeOutroChamado(conversa.dados.chamadoId)
    ? { ...conversa, dados: null, status: "carregando" }
    : conversa;

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
        detalhe={detalheAtual}
        conversa={conversaAtual}
        aoVoltar={() => navegar("/atendimentos")}
        aoAbrirDetalhes={() => setDetalhesAbertos(true)}
        executarAcao={executarAcao}
        aoAssumir={() => setFila("meus")}
      />
      {chamadoId && <DetalhesChamado detalhe={detalheAtual} aoFechar={() => setDetalhesAbertos(false)} />}
    </div>
  );
}