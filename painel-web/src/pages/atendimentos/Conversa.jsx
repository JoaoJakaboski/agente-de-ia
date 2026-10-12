import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSessao } from "../../lib/sessao";
import { useAgora } from "../../lib/useAgora";
import Icone from "../../components/Icone";
import Botao from "../../components/Botao";
import { EstadoErro, EstadoVazio, Esqueleto } from "../../components/Estados";
import { rotuloDia, textoEvento } from "../../lib/formatos";
import CabecalhoConversa from "./CabecalhoConversa";
import { LinhaSistema, Mensagem } from "./Mensagem";
import Modal from "../../components/Modal";
import CaixaResposta from "./CaixaResposta";
import ModalEncerrar from "./ModalEncerrar";

const DISTANCIA_FIM_PX = 80;

function montarLinhaDoTempo({ mensagens, eventos }, agora) {
  const primeiraDoBot = mensagens.find((mensagem) => mensagem.remetente === "bot");

  const itens = [
    ...mensagens.map((mensagem) => ({
      chave: `m-${mensagem.id}`,
      em: mensagem.criado_em,
      mensagem,
      avisoPrivacidade: Boolean(primeiraDoBot) && mensagem.id === primeiraDoBot.id,
    })),
    ...eventos
      .map((evento) => ({ chave: `e-${evento.id}`, em: evento.criado_em, sistema: textoEvento(evento) }))
      .filter((item) => item.sistema),
  ].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));

  // separador de dia sempre que a data muda
  const comDias = [];
  let diaAnterior = null;
  for (const item of itens) {
    const dia = new Date(item.em).toDateString();
    if (dia !== diaAnterior) {
      comDias.push({ chave: `d-${dia}`, dia: rotuloDia(item.em, agora) });
      diaAnterior = dia;
    }
    comDias.push(item);
  }
  return comDias;
}

function motivoBloqueio(chamado, usuario) {
  switch (chamado.status) {
    case "aguardando_humano":
      return "Assuma o atendimento para responder";
    case "em_atendimento_humano":
      return chamado.atendente_id === usuario.id
        ? "Responder pelo painel chega na próxima etapa"
        : chamado.atendente_nome ? `${chamado.atendente_nome} está atendendo` : "A equipe está atendendo pelo WhatsApp";
      case "encerrado":
      return "Chamado encerrado";
    default:
      return "O bot está atendendo este cliente";
  }
}

function LinhaDoTempo({ chamadoId, conversa }) {
  const area = useRef(null);
  const pertoDoFim = useRef(true);
  const totalAnterior = useRef(0);
  const [novas, setNovas] = useState(0);
  const agora = useAgora(60000);

  const itens = useMemo(
    () => (conversa.dados ? montarLinhaDoTempo(conversa.dados, agora) : []),
    [conversa.dados, agora]
  );
  const totalMensagens = conversa.dados ? conversa.dados.mensagens.length : 0;

  useEffect(() => {
    totalAnterior.current = 0;
    pertoDoFim.current = true;
    setNovas(0);
  }, [chamadoId]);

  useLayoutEffect(() => {
    if (!conversa.dados) return;
    const elemento = area.current;
    const chegaram = totalMensagens - totalAnterior.current;

    if (totalAnterior.current === 0 || pertoDoFim.current) {
      elemento.scrollTop = elemento.scrollHeight;
    } else if (chegaram > 0) {
      setNovas((quantidade) => quantidade + chegaram);
    }
    totalAnterior.current = totalMensagens;
  }, [conversa.dados, totalMensagens]);

  function aoRolar() {
    const elemento = area.current;
    pertoDoFim.current = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight < DISTANCIA_FIM_PX;
    if (pertoDoFim.current) setNovas(0);
  }

  function irParaFim() {
    area.current.scrollTop = area.current.scrollHeight;
    setNovas(0);
  }

  return (
    <div className="atend__thread-area">
      <div className="pa-thread" ref={area} onScroll={aoRolar} role="log" aria-label="Mensagens">
        {conversa.status === "carregando" && <Esqueleto linhas={4} />}
        {conversa.status === "erro" && (
          <EstadoErro titulo="Não foi possível carregar as mensagens" aoTentar={conversa.recarregar} />
        )}
        {conversa.status === "ok" &&
          itens.map((item) => {
            if (item.dia) return <div key={item.chave} className="pa-day">{item.dia}</div>;
            if (item.sistema) return <LinhaSistema key={item.chave} texto={item.sistema} em={item.em} />;
            return <Mensagem key={item.chave} mensagem={item.mensagem} avisoPrivacidade={item.avisoPrivacidade} />;
          })}
      </div>

      {novas > 0 && (
        <button type="button" className="pa-newpill" onClick={irParaFim}>
          <Icone nome="setaParaBaixo" />
          {novas === 1 ? "1 nova mensagem" : `${novas} novas mensagens`}
        </button>
      )}
    </div>
  );
}

const ERROS_ACAO = {
  ja_assumido: "Outra pessoa já assumiu este atendimento.",
  nao_e_seu: "Este atendimento não está mais com você.",
  dados_invalidos: "Confira os dados e tente de novo.",
};

function textoConfirmarAssumir(chamado) {
  if (chamado.status === "em_atendimento_humano") {
    return "Alguém da equipe está respondendo pelo WhatsApp da empresa. Ao assumir, a conversa passa para você no painel.";
  }
  return "O bot vai parar de responder este cliente e a conversa passa para você.";
}

export default function Conversa({ chamadoId, detalhe, conversa, aoVoltar, aoAbrirDetalhes, executarAcao, aoAssumir }) {
  const { usuario } = useSessao();
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(caminho, corpo, aposSucesso) {
    setOcupado(true);
    setAviso(null);
    try {
      const resposta = await executarAcao(caminho, corpo);
      setModal(null);
      if (aposSucesso) aposSucesso(resposta);
    } catch (erro) {
      setModal(null);
      setAviso(ERROS_ACAO[erro.codigo] || "Não foi possível concluir a ação. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  if (!chamadoId) {
    return (
      <section className="atend__conversa atend__conversa--vazia" aria-label="Conversa">
        <EstadoVazio icone="conversa" titulo="Selecione um chamado" texto="Escolha um chamado na lista para ver a conversa." />
      </section>
    );
  }

  if (detalhe.status === "erro") {
    const naoEncontrado = detalhe.erro && detalhe.erro.status === 404;
    return (
      <section className="atend__conversa atend__conversa--vazia" aria-label="Conversa">
        {naoEncontrado ? (
          <EstadoVazio
            icone="busca"
            titulo="Chamado não encontrado"
            texto="Ele pode ter sido removido ou o endereço está incorreto."
            acao={<Botao onClick={aoVoltar}>Voltar para a lista</Botao>}
          />
        ) : (
          <EstadoErro titulo="Não foi possível carregar o chamado" aoTentar={detalhe.recarregar} />
        )}
      </section>
    );
  }

  const chamado = detalhe.dados;
  const meu = chamado && chamado.status === "em_atendimento_humano" && chamado.atendente_id === usuario.id;

  return (
    <section className="atend__conversa" aria-label="Conversa">
      {chamado ? (
        <CabecalhoConversa
          chamado={chamado}
          ocupado={ocupado}
          aoVoltar={aoVoltar}
          aoAbrirDetalhes={aoAbrirDetalhes}
          aoAssumir={() => rodar("assumir", {}, aoAssumir)}
          aoConfirmarAssumir={() => setModal("assumir")}
          aoDevolver={() => rodar("devolver", {})}
          aoEncerrar={() => setModal("encerrar")}
        />
      ) : (
        <div className="pa-convhd"><Esqueleto linhas={1} /></div>
      )}

      {aviso && (
        <div className="pa-alert pa-alert--warn atend__aviso" role="alert">
          <Icone nome="alerta" />
          <span>{aviso}</span>
          <button type="button" className="pa-iconbtn" aria-label="Fechar aviso" onClick={() => setAviso(null)}>
            <Icone nome="fechar" />
          </button>
        </div>
      )}

      <LinhaDoTempo chamadoId={chamadoId} conversa={conversa} />

      {chamado && (meu ? (
        <CaixaResposta aoEnviar={(texto) => executarAcao("mensagens", { texto })} />
      ) : (
        <div className="pa-composer pa-composer--locked">
          <Icone nome="cadeado" />
          {motivoBloqueio(chamado, usuario)}
        </div>
      ))}

      {modal === "assumir" && chamado && (
        <Modal
          titulo="Assumir este atendimento?"
          aoFechar={() => setModal(null)}
          rodape={
            <>
              <Botao onClick={() => setModal(null)}>Cancelar</Botao>
              <Botao variante="primario" icone={<Icone nome="headset" />} disabled={ocupado} onClick={() => rodar("assumir", {}, aoAssumir)}>
                Assumir atendimento
              </Botao>
            </>
          }
        >
          <p>{textoConfirmarAssumir(chamado)}</p>
        </Modal>
      )}

      {modal === "encerrar" && (
        <ModalEncerrar
          ocupado={ocupado}
          aoCancelar={() => setModal(null)}
          aoConfirmar={(dados) =>
            rodar("encerrar", dados, (resposta) => {
              if (resposta && resposta.mensagemEnviada === false) {
                setAviso("O chamado foi encerrado, mas a mensagem de encerramento não chegou ao cliente.");
              }
            })
          }
        />
      )}
    </section>
  );
}