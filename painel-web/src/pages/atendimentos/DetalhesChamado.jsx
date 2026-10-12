import { useAgora } from "../../lib/useAgora";
import Icone from "../../components/Icone";
import StatusBadge from "../../components/StatusBadge";
import AssuntoTag from "../../components/AssuntoTag";
import { EstadoErro, Esqueleto } from "../../components/Estados";
import { dataHora, duracao, formatarTelefone, numero, rotuloMotivoEncerramento } from "../../lib/formatos";

function Inatividade({ chamado, agora }) {
  const fim = Date.parse(chamado.encerramento_previsto_em);
  const total = chamado.horas_inatividade * 60 * 60 * 1000;
  const restanteMin = Math.max(0, Math.ceil((fim - agora) / 60000));
  const progresso = Math.min(100, Math.max(0, ((total - (fim - agora)) / total) * 100));

  return (
    <section>
      <h3 className="atend__titulo-secao">Encerramento automático</h3>
      <p className="atend__inatividade">
        {restanteMin > 0 ? `Encerra por inatividade em ${duracao(restanteMin)}` : "Encerrando por inatividade…"}
      </p>
      <div
        className="pa-meter"
        role="progressbar"
        aria-label="Tempo sem mensagens"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progresso)}
      >
        <i style={{ width: `${progresso}%` }} />
      </div>
    </section>
  );
}

export default function DetalhesChamado({ detalhe, aoFechar }) {
  const agora = useAgora();
  const chamado = detalhe.dados;

  return (
    <aside className="atend__detalhes" aria-label="Detalhes do chamado">
      <div className="atend__detalhes-topo">
        <h2 className="atend__titulo-secao">Detalhes</h2>
        <button type="button" className="pa-iconbtn atend__fechar-detalhes" aria-label="Fechar detalhes" onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      </div>

      {detalhe.status === "carregando" && <Esqueleto linhas={6} />}
      {detalhe.status === "erro" && <EstadoErro titulo="Não foi possível carregar os detalhes" aoTentar={detalhe.recarregar} />}

      {chamado && (
        <>
          <section className="pa-resumo" aria-label="Resumo da IA">
            <div className="pa-resumo__hd">
              <Icone nome="brilho" />
              Resumo da IA
            </div>
            <p className="pa-resumo__txt">
              {chamado.contexto || "A IA ainda não tem informações suficientes para resumir."}
            </p>
          </section>

          {chamado.encerramento_previsto_em && chamado.horas_inatividade && (
            <Inatividade chamado={chamado} agora={agora} />
          )}

          <section>
            <h3 className="atend__titulo-secao">Dados do chamado</h3>
            <dl className="pa-dl">
              <dt>Telefone</dt>
              <dd>{formatarTelefone(chamado.telefone_cliente)}</dd>
              <dt>Nome</dt>
              <dd>{chamado.nome_cliente || "Não informado"}</dd>
              <dt>Status</dt>
              <dd><StatusBadge status={chamado.status} /></dd>
              <dt>Assunto</dt>
              <dd>{chamado.assunto ? <AssuntoTag assunto={chamado.assunto} /> : "—"}</dd>
              {chamado.atendente_nome && (
                <>
                  <dt>Atendente</dt>
                  <dd>{chamado.atendente_nome}</dd>
                </>
              )}
              <dt>Aberto em</dt>
              <dd>{dataHora(chamado.criado_em)}</dd>
              <dt>Atualizado em</dt>
              <dd>{dataHora(chamado.atualizado_em)}</dd>
              {chamado.encerrado_em && (
                <>
                  <dt>Encerrado em</dt>
                  <dd>{dataHora(chamado.encerrado_em)}</dd>
                </>
              )}
              {chamado.motivo_encerramento && (
                <>
                  <dt>Motivo</dt>
                  <dd>{rotuloMotivoEncerramento(chamado.motivo_encerramento)}</dd>
                </>
              )}
              {chamado.observacao_encerramento && (
                <>
                  <dt>Observação</dt>
                  <dd>{chamado.observacao_encerramento}</dd>
                </>
              )}
            </dl>
          </section>

          <section>
            <h3 className="atend__titulo-secao">Uso de IA</h3>
            <dl className="pa-dl">
              <dt>Tokens de entrada</dt>
              <dd className="pa-num">{numero(chamado.tokens.entrada)}</dd>
              <dt>Tokens de saída</dt>
              <dd className="pa-num">{numero(chamado.tokens.saida)}</dd>
            </dl>
          </section>
        </>
      )}
    </aside>
  );
}