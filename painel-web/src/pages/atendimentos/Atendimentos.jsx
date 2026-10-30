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

const CHAVE_LARGURA = "pa:largura-lista";
const LARGURA_MIN = 260;
const LARGURA_MAX = 560;
const PASSO_TECLADO = 16;

function limitarLargura(valor) {
  return Math.round(Math.min(Math.max(valor, LARGURA_MIN), LARGURA_MAX));
}

// preferência deste navegador; sem ela (ou sem acesso ao armazenamento) vale o padrão do CSS
function lerLargura() {
  try {
    const valor = Number(localStorage.getItem(CHAVE_LARGURA));
    return valor >= LARGURA_MIN && valor <= LARGURA_MAX ? valor : null;
  } catch {
    return null;
  }
}

function gravarLargura(valor) {
  try {
    if (valor) localStorage.setItem(CHAVE_LARGURA, String(valor));
    else localStorage.removeItem(CHAVE_LARGURA);
  } catch {
    // sem armazenamento: a largura vale só até recarregar a página
  }
}

function AlcaLargura({ raiz, largura, aoMudar }) {
  function iniciarArraste(evento) {
    if (evento.button !== 0) return;
    evento.preventDefault();

    const alca = evento.currentTarget;
    const inicio = raiz.current.getBoundingClientRect().left;
    let atual = largura || raiz.current.querySelector(".atend__lista").getBoundingClientRect().width;

    alca.setPointerCapture(evento.pointerId);
    document.body.classList.add("pa-redimensionando");

    // durante o arraste mexe só na variável CSS, sem renderizar a página a cada pixel
    function mover(movimento) {
      atual = limitarLargura(movimento.clientX - inicio);
      raiz.current.style.setProperty("--largura-lista", `${atual}px`);
    }

    function soltar() {
      alca.removeEventListener("pointermove", mover);
      alca.removeEventListener("pointerup", soltar);
      alca.removeEventListener("pointercancel", soltar);
      document.body.classList.remove("pa-redimensionando");
      aoMudar(atual);
    }

    alca.addEventListener("pointermove", mover);
    alca.addEventListener("pointerup", soltar);
    alca.addEventListener("pointercancel", soltar);
  }

  function aoTeclar(evento) {
    const base = largura || raiz.current.querySelector(".atend__lista").getBoundingClientRect().width;
    const proxima = {
      ArrowLeft: base - PASSO_TECLADO,
      ArrowRight: base + PASSO_TECLADO,
      Home: LARGURA_MIN,
      End: LARGURA_MAX,
    }[evento.key];
    if (proxima === undefined) return;
    evento.preventDefault();
    aoMudar(limitarLargura(proxima));
  }

  return (
    <div
      className="atend__alca"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura da lista de chamados (duplo clique volta ao padrão)"
      aria-valuemin={LARGURA_MIN}
      aria-valuemax={LARGURA_MAX}
      aria-valuenow={largura || undefined}
      tabIndex={0}
      onPointerDown={iniciarArraste}
      onKeyDown={aoTeclar}
      onDoubleClick={() => aoMudar(null)}
    />
  );
}

export default function Atendimentos() {
  const { chamadoId } = useParams();
  const navegar = useNavigate();
  const local = useLocation();
  const [fila, setFila] = useState((local.state && local.state.fila) || "aguardando");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const timers = useRef({});
  const raiz = useRef(null);
  const [larguraLista, setLarguraLista] = useState(lerLargura);

  function mudarLargura(valor) {
    setLarguraLista(valor);
    gravarLargura(valor);
  }

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
    <div 
      ref={raiz}
      className={classes}
      style={larguraLista ? { "--largura-lista": `${larguraLista}px` } : undefined}>
      <AlcaLargura raiz={raiz} largura={larguraLista} aoMudar={mudarLargura} />
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