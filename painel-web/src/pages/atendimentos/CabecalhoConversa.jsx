import { useSessao } from "../../lib/sessao";
import Icone from "../../components/Icone";
import Botao from "../../components/Botao";
import StatusBadge from "../../components/StatusBadge";
import { formatarTelefone, iniciais, rotuloMotivoEncerramento } from "../../lib/formatos";
import { useState } from "react";

function NomeCliente({ nome, titulo, ocupado, aoSalvar }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");

  if (!editando) {
    return (
      <span className="atend__nome">
        <span>{titulo}</span>
        <button
          type="button"
          className="pa-iconbtn"
          aria-label={nome ? "Editar nome do cliente" : "Adicionar nome do cliente"}
          onClick={() => { setValor(nome || ""); setEditando(true); }}
        >
          <Icone nome="editar" />
        </button>
      </span>
    );
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (ocupado) return;
    const novo = valor.trim();
    if (novo !== (nome || "")) await aoSalvar(novo);
    setEditando(false);
  }

  return (
    <form className="atend__nome-form" onSubmit={salvar}>
      <input
        className="pa-input"
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        onKeyDown={(evento) => { if (evento.key === "Escape") setEditando(false); }}
        maxLength={80}
        placeholder="Nome do cliente"
        autoFocus
        aria-label="Nome do cliente"
      />
      <Botao type="button" variante="primario" disabled={ocupado} onClick={salvar}>Salvar</Botao>
      <Botao type="button" onClick={() => setEditando(false)}>Cancelar</Botao>
    </form>
  );
}

function Acoes({ chamado, usuario, ocupado, aoAssumir, aoConfirmarAssumir, aoEncerrar }) {
  if (chamado.status === "aguardando_humano") {
    return (
      <Botao variante="primario" tamanho="lg" icone={<Icone nome="headset" />} disabled={ocupado} onClick={aoAssumir}>
        Assumir atendimento
      </Botao>
    );
  }

  const meu = chamado.status === "em_atendimento_humano" && chamado.atendente_id === usuario.id;
  if (meu) {
    return (
      <>
        <Botao variante="perigo" icone={<Icone nome="encerrar" />} disabled={ocupado} onClick={aoEncerrar}>
          Encerrar atendimento
        </Botao>
      </>
    );
  }

  // com o bot, ou com a equipe pelo celular: dá para assumir, com confirmação
  const podeAssumir =
    chamado.status === "bot" ||
    chamado.status === "agente" ||
    (chamado.status === "em_atendimento_humano" && !chamado.atendente_id);

  return (
    <>
      <span className="pa-somente-leitura">
        <Icone nome="olho" />
        Somente leitura
      </span>
      {podeAssumir && (
        <Botao variante="fantasma" disabled={ocupado} onClick={aoConfirmarAssumir}>Assumir mesmo assim</Botao>
      )}
    </>
  );
}

export default function CabecalhoConversa({ chamado, ocupado, aoVoltar, aoAbrirDetalhes, aoRenomear, ...acoes }) {
  const { usuario } = useSessao();
  const nome = chamado.nome_cliente;
  const telefone = formatarTelefone(chamado.telefone_cliente);

  const subtitulo = [];
  if (nome) subtitulo.push(telefone);
  if (chamado.status === "em_atendimento_humano" && chamado.atendente_id !== usuario.id) {
    subtitulo.push(`Atendido por ${chamado.atendente_nome || "WhatsApp da empresa"}`);
  }
  if (chamado.status === "encerrado" && chamado.motivo_encerramento) {
    subtitulo.push(rotuloMotivoEncerramento(chamado.motivo_encerramento));
  }

  return (
    <header className="pa-convhd">
      <button type="button" className="pa-iconbtn atend__voltar" aria-label="Voltar para a lista" onClick={aoVoltar}>
        <Icone nome="voltar" />
      </button>

      <span className="pa-avatar" aria-hidden="true">
        {nome ? iniciais(nome) : <Icone nome="pessoa" />}
      </span>

      <div className="pa-convhd__who">
        <div className="pa-convhd__name">
          <NomeCliente nome={nome} titulo={nome || telefone} ocupado={ocupado} aoSalvar={aoRenomear} />
        </div>
        <div className="pa-convhd__sub">
          <StatusBadge status={chamado.status} />
          {subtitulo.map((texto) => <span key={texto}>{texto}</span>)}
        </div>
      </div>

      <div className="pa-convhd__actions">
        <Acoes chamado={chamado} usuario={usuario} ocupado={ocupado} {...acoes} />
        <button type="button" className="pa-iconbtn atend__abrir-detalhes" aria-label="Detalhes do chamado" onClick={aoAbrirDetalhes}>
          <Icone nome="info" />
        </button>
      </div>
    </header>
  );
}