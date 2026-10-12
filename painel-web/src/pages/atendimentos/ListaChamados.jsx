import { useSessao } from "../../lib/sessao";
import { useTempoReal } from "../../lib/tempoReal";
import { useAgora } from "../../lib/useAgora";
import Icone from "../../components/Icone";
import { EstadoErro, EstadoVazio, Esqueleto } from "../../components/Estados";
import ItemChamado from "./ItemChamado";

const ABAS = [
  { id: "aguardando", curto: "Aguardando", completo: "Aguardando atendente" },
  { id: "meus", curto: "Meus", completo: "Meus atendimentos" },
  { id: "bot", curto: "Com o bot", completo: "Com o bot (bot e IA)" },
  { id: "encerrados", curto: "Encerrados", completo: "Encerrados" },
];

const VAZIOS = {
  aguardando: { icone: "checkCirculo", titulo: "Ninguém aguardando", texto: "Quando o bot encaminhar um cliente, ele aparece aqui." },
  meus: { icone: "headset", titulo: "Você não está atendendo ninguém", texto: "Assuma um chamado da aba Aguardando para começar." },
  bot: { icone: "bot", titulo: "Nenhuma conversa com o bot", texto: "Conversas em andamento com o bot e a IA aparecem aqui." },
  encerrados: { icone: "caixa", titulo: "Nenhum chamado encerrado", texto: "Os chamados encerrados aparecem aqui." },
};

const SEM_CONEXAO_MS = 30000;

export default function ListaChamados({ fila, aoTrocarFila, busca, aoBuscar, lista, selecionadoId, aoSelecionar }) {
  const { usuario } = useSessao();
  const { contagens, offlineDesde } = useTempoReal();
  const agora = useAgora();
  const semConexaoHaTempo = offlineDesde && agora - offlineDesde > SEM_CONEXAO_MS;

  function item(chamado) {
    return (
      <ItemChamado
        key={chamado.id}
        chamado={chamado}
        agora={agora}
        selecionado={chamado.id === selecionadoId}
        onClick={() => aoSelecionar(chamado.id)}
      />
    );
  }

  function conteudo() {
    if (lista.status === "carregando") return <Esqueleto linhas={5} />;

    if (lista.status === "erro") {
      return (
        <EstadoErro
          titulo="Não foi possível carregar os chamados"
          texto="Confira sua conexão e tente de novo."
          aoTentar={lista.recarregar}
        />
      );
    }

    const chamados = lista.dados;
    if (chamados.length === 0) {
      return busca.trim()
        ? <EstadoVazio icone="busca" titulo="Nada encontrado" texto="Nenhum chamado com esse nome ou telefone nesta aba." />
        : <EstadoVazio {...VAZIOS[fila]} />;
    }

    if (fila !== "meus") return chamados.map(item);

    // em "Meus", os chamados de outros atendentes ficam abaixo de um separador, só para leitura
    const meus = chamados.filter((chamado) => chamado.atendente_id === usuario.id);
    const deOutros = chamados.filter((chamado) => chamado.atendente_id !== usuario.id);

    return (
      <>
        {meus.length === 0 && <EstadoVazio {...VAZIOS.meus} />}
        {meus.map(item)}
        {deOutros.length > 0 && <div className="atend__separador">Com outros atendentes · somente leitura</div>}
        {deOutros.map(item)}
      </>
    );
  }

  return (
    <section className="atend__lista" aria-label="Chamados">
      <div className="atend__lista-topo">
        <div className="pa-tabs" role="tablist" aria-label="Filas de atendimento">
          {ABAS.map((aba) => {
            const total = contagens && aba.id !== "encerrados" ? contagens[aba.id] : null;
            const alerta = aba.id === "aguardando" && total > 0;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                className="pa-tab"
                aria-selected={fila === aba.id}
                aria-controls="lista-chamados"
                title={aba.completo}
                onClick={() => aoTrocarFila(aba.id)}
              >
                <span className="pa-tab__rotulo">{aba.curto}</span>
                {total !== null && (
                  <span className={`pa-count${alerta ? " pa-count--alerta" : ""}`}>{total}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="pa-search">
          <Icone nome="busca" />
          <input
            className="pa-input"
            type="search"
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar por nome ou telefone"
            maxLength={60}
            value={busca}
            onChange={(evento) => aoBuscar(evento.target.value)}
          />
        </div>
      </div>

      {semConexaoHaTempo && (
        <p className="pa-alert pa-alert--warn atend__alerta-conexao" role="status">
          <Icone nome="alerta" />
          Sem conexão em tempo real. As mensagens novas podem demorar.
        </p>
      )}

      <div id="lista-chamados" className="atend__itens" role="tabpanel">
        {conteudo()}
      </div>
    </section>
  );
}