import { useState } from "react";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import { rotuloAssunto, rotuloMotivoEncerramento } from "../../lib/formatos";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";
import { EstadoErro, Esqueleto } from "../../components/Estados";
import { Cartao, BarrasPorDia, BarrasHorizontais } from "./Graficos";
import ModalPrecos from "./ModalPrecos";
import {
  hoje, somarDias, preencherDias, formatarDolar, formatarInteiro, porcentagem, formatarMinutos, baixarCsv,
} from "./indicadores";
import "./admin.css";
import "./VisaoGeral.css";

const ATALHOS = [7, 30, 90];
const CAMADAS_RESPOSTA = { ml: "Classificador (ML)", llm: "IA classificadora", agente: "Agente de IA", agente_falha: "Falha do agente" };
const CAMADAS_USO = { classificadora: "IA classificadora", agente: "Agente de IA" };

function Bloco({ titulo, descricao, acoes, children }) {
  return (
    <section className="pa-card vg-bloco">
      <header className="vg-bloco__hd">
        <div>
          <h2 className="vg-bloco__titulo">{titulo}</h2>
          {descricao && <p className="vg-bloco__sub">{descricao}</p>}
        </div>
        {acoes && <div className="vg-bloco__acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

function BotaoCsv({ aoClicar }) {
  return <Botao variante="fantasma" icone={<Icone nome="documento" />} onClick={aoClicar}>CSV</Botao>;
}

export default function VisaoGeral() {
  const [periodo, setPeriodo] = useState(() => ({ de: somarDias(hoje(), -29), ate: hoje(), atalho: 30 }));
  const [editandoPrecos, setEditandoPrecos] = useState(false);

  const recurso = useRecurso(
    () => api(`/admin/indicadores?de=${periodo.de}&ate=${periodo.ate}`),
    [periodo.de, periodo.ate]
  );

  function usarAtalho(dias) {
    setPeriodo({ de: somarDias(hoje(), -(dias - 1)), ate: hoje(), atalho: dias });
  }

  function mudarData(campo, valor) {
    if (!valor) return;
    setPeriodo((atual) => {
      const novo = { ...atual, [campo]: valor, atalho: null };
      return novo.de <= novo.ate ? novo : atual;
    });
  }

  const sufixo = `${periodo.de}_a_${periodo.ate}`;

  function conteudo() {
    if (recurso.status === "carregando") return <Esqueleto linhas={8} />;
    if (recurso.status === "erro") {
      return <EstadoErro titulo="Não foi possível carregar os indicadores" aoTentar={recurso.recarregar} />;
    }

    const { funil, ia, atendimento } = recurso.dados;
    const diasFunil = preencherDias(periodo.de, periodo.ate, funil.por_dia, ["total", "sem_humano"]);
    const diasIa = preencherDias(periodo.de, periodo.ate, ia.por_dia, ["custo", "tokens"]);
    const tentativasAgente = ia.respostas_agente + ia.falhas_agente;

    return (
      <>
        <Bloco
          titulo="Funil de atendimento"
          descricao="Chamados abertos no período, sem contar as conversas iniciadas pela equipe."
          acoes={
            <BotaoCsv aoClicar={() => baixarCsv(`funil_por_dia_${sufixo}`, [
              { rotulo: "Dia", valor: (l) => l.dia },
              { rotulo: "Chamados", valor: (l) => l.total },
              { rotulo: "Resolvidos sem humano", valor: (l) => l.sem_humano },
            ], diasFunil)} />
          }
        >
          <div className="vg-cartoes">
            <Cartao rotulo="Chamados" valor={formatarInteiro(funil.total)} detalhe={`${formatarInteiro(funil.em_aberto)} ainda abertos`} />
            <Cartao
              rotulo="Resolvidos sem humano"
              valor={porcentagem(funil.resolvidos_sem_humano, funil.encerrados)}
              detalhe={`${formatarInteiro(funil.resolvidos_sem_humano)} de ${formatarInteiro(funil.encerrados)} encerrados`}
            />
            <Cartao
              rotulo="Passaram por atendente"
              valor={porcentagem(funil.com_humano, funil.total)}
              detalhe={`${formatarInteiro(funil.com_humano)} chamados`}
            />
          </div>

          <div>
            <h3 className="vg-subtitulo">Chamados por dia</h3>
            <BarrasPorDia dias={diasFunil} campo="total" formatar={formatarInteiro} descricao="Chamados abertos por dia" />
          </div>

          <div className="vg-grade">
            <div>
              <h3 className="vg-subtitulo">Respostas do bot por camada</h3>
              <BarrasHorizontais
                itens={funil.respostas_por_camada.map((item) => ({
                  chave: item.camada, rotulo: CAMADAS_RESPOSTA[item.camada] || item.camada, valor: item.total,
                }))}
                formatar={formatarInteiro}
              />
            </div>
            <div>
              <h3 className="vg-subtitulo">Motivos de encaminhamento</h3>
              <BarrasHorizontais
                itens={funil.escalados_por_motivo.map((item) => ({
                  chave: item.motivo, rotulo: item.motivo === "sem_motivo" ? "Sem motivo" : rotuloAssunto(item.motivo), valor: item.total,
                }))}
                formatar={formatarInteiro}
              />
            </div>
            <div>
              <h3 className="vg-subtitulo">Intenções mais reconhecidas</h3>
              <BarrasHorizontais
                itens={funil.intencoes.map((item) => ({ chave: item.intencao, rotulo: item.intencao, valor: item.total }))}
                formatar={formatarInteiro}
                classeRotulo="pa-mono"
              />
            </div>
          </div>
        </Bloco>

        <Bloco
          titulo="Uso de IA"
          descricao="Chamadas às camadas de IA (classificadora e agente), em dólares pelo preço cadastrado de cada modelo."
          acoes={
            <>
              <Botao variante="fantasma" icone={<Icone nome="engrenagem" />} onClick={() => setEditandoPrecos(true)}>Preços</Botao>
              <BotaoCsv aoClicar={() => baixarCsv(`ia_por_camada_e_modelo_${sufixo}`, [
                { rotulo: "Tipo", valor: (l) => l.tipo },
                { rotulo: "Nome", valor: (l) => l.nome },
                { rotulo: "Chamadas", valor: (l) => l.chamadas },
                { rotulo: "Tokens de entrada", valor: (l) => l.tokens_entrada },
                { rotulo: "Tokens de saída", valor: (l) => l.tokens_saida },
                { rotulo: "Custo (US$)", valor: (l) => Number(l.custo) },
              ], [
                ...ia.por_camada.map((l) => ({ ...l, tipo: "Camada", nome: CAMADAS_USO[l.camada] || l.camada })),
                ...ia.por_modelo.map((l) => ({ ...l, tipo: "Modelo", nome: l.modelo })),
              ])} />
            </>
          }
        >
          {ia.modelos_sem_preco.length > 0 && (
            <p className="pa-alert pa-alert--warn" role="status">
              <Icone nome="alerta" />
              <span>
                Sem preço cadastrado para {ia.modelos_sem_preco.join(", ")}: o custo desses modelos aparece como zero.{" "}
                <button type="button" className="vg-link" onClick={() => setEditandoPrecos(true)}>Cadastrar preços</button>
              </span>
            </p>
          )}

          <div className="vg-cartoes">
            <Cartao rotulo="Custo no período" valor={formatarDolar(ia.custo)} detalhe={`${formatarInteiro(ia.chamadas)} chamadas à IA`} />
            <Cartao
              rotulo="Custo médio por chamado"
              valor={ia.chamados_com_ia ? formatarDolar(ia.custo / ia.chamados_com_ia) : "—"}
              detalhe={`${formatarInteiro(ia.chamados_com_ia)} chamados usaram IA`}
            />
            <Cartao
              rotulo="Tokens"
              valor={formatarInteiro(ia.tokens_entrada + ia.tokens_saida)}
              detalhe={`${formatarInteiro(ia.tokens_entrada)} de entrada · ${formatarInteiro(ia.tokens_saida)} de saída`}
            />
            <Cartao
              rotulo="Falhas do agente"
              valor={porcentagem(ia.falhas_agente, tentativasAgente)}
              detalhe={`${formatarInteiro(ia.falhas_agente)} de ${formatarInteiro(tentativasAgente)} respostas`}
            />
          </div>

          <div>
            <h3 className="vg-subtitulo">Custo por dia</h3>
            <BarrasPorDia dias={diasIa} campo="custo" formatar={formatarDolar} descricao="Custo de IA por dia, em dólares" />
          </div>

          <div className="vg-grade">
            {[
              { titulo: "Por camada", linhas: ia.por_camada, nome: (l) => CAMADAS_USO[l.camada] || l.camada, chave: "camada" },
              { titulo: "Por modelo", linhas: ia.por_modelo, nome: (l) => l.modelo, chave: "modelo", mono: true },
            ].map((tabela) => (
              <div key={tabela.titulo}>
                <h3 className="vg-subtitulo">{tabela.titulo}</h3>
                {tabela.linhas.length === 0 ? (
                  <p className="vg-vazio">Sem dados no período.</p>
                ) : (
                  <table className="pa-table">
                    <thead>
                      <tr><th>{tabela.titulo === "Por camada" ? "Camada" : "Modelo"}</th><th>Chamadas</th><th>Tokens</th><th>Custo</th></tr>
                    </thead>
                    <tbody>
                      {tabela.linhas.map((l) => (
                        <tr key={l[tabela.chave]}>
                          <td className={tabela.mono ? "pa-mono" : undefined}>{tabela.nome(l)}</td>
                          <td>{formatarInteiro(l.chamadas)}</td>
                          <td>{formatarInteiro(l.tokens_entrada + l.tokens_saida)}</td>
                          <td>{formatarDolar(l.custo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </Bloco>

        <Bloco
          titulo="Atendimento humano"
          descricao="Tempos medidos pelo histórico de status de cada chamado."
          acoes={
            <BotaoCsv aoClicar={() => baixarCsv(`atendentes_${sufixo}`, [
              { rotulo: "Atendente", valor: (l) => l.nome || "Usuário removido" },
              { rotulo: "Atendimentos assumidos", valor: (l) => l.assumidos },
              { rotulo: "Encerrados", valor: (l) => l.encerrados },
              { rotulo: "Duração média (min)", valor: (l) => (l.media_min == null ? null : Math.round(l.media_min * 10) / 10) },
            ], atendimento.por_atendente)} />
          }
        >
          <div className="vg-cartoes">
            <Cartao rotulo="Aguardando agora" valor={formatarInteiro(atendimento.aguardando_agora)} detalhe="na fila neste momento" />
            <Cartao rotulo="Em atendimento agora" valor={formatarInteiro(atendimento.em_atendimento_agora)} />
            <Cartao
              rotulo="Espera na fila (mediana)"
              valor={formatarMinutos(atendimento.fila.mediana_min)}
              detalhe={atendimento.fila.total ? `média ${formatarMinutos(atendimento.fila.media_min)} · ${formatarInteiro(atendimento.fila.total)} esperas` : "nenhuma no período"}
            />
            <Cartao
              rotulo="Duração do atendimento (mediana)"
              valor={formatarMinutos(atendimento.duracao.mediana_min)}
              detalhe={atendimento.duracao.total ? `média ${formatarMinutos(atendimento.duracao.media_min)} · ${formatarInteiro(atendimento.duracao.total)} atendimentos` : "nenhum no período"}
            />
          </div>

          <div className="vg-grade">
            <div>
              <h3 className="vg-subtitulo">Por atendente</h3>
              {atendimento.por_atendente.length === 0 ? (
                <p className="vg-vazio">Nenhum atendimento assumido no período.</p>
              ) : (
                <table className="pa-table">
                  <thead>
                    <tr><th>Atendente</th><th>Assumidos</th><th>Encerrados</th><th>Duração média</th></tr>
                  </thead>
                  <tbody>
                    {atendimento.por_atendente.map((l) => (
                      <tr key={l.atendente_id}>
                        <td>
                          {l.nome || <span className="pa-faint">Usuário removido</span>}
                          {l.ativo === false && <span className="pa-faint"> · desativado</span>}
                        </td>
                        <td>{formatarInteiro(l.assumidos)}</td>
                        <td>{formatarInteiro(l.encerrados)}</td>
                        <td>{formatarMinutos(l.media_min)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3 className="vg-subtitulo">Encerramentos por motivo</h3>
              <BarrasHorizontais
                itens={funil.encerramentos_por_motivo.map((item) => ({
                  chave: item.motivo,
                  rotulo: item.motivo === "sem_motivo" ? "Sem motivo" : rotuloMotivoEncerramento(item.motivo),
                  valor: item.total,
                }))}
                formatar={formatarInteiro}
              />
            </div>
          </div>
        </Bloco>
      </>
    );
  }

  return (
    <div className="pa-page">
      <header className="pa-page__hd">
        <div>
          <h1 className="pa-page__title">Visão geral</h1>
          <p className="pa-page__sub">Desempenho do bot, custo de IA e atendimento da equipe no período.</p>
        </div>
      </header>

      <div className="vg-periodo">
        <div className="pa-tabs" role="tablist" aria-label="Período">
          {ATALHOS.map((dias) => (
            <button key={dias} type="button" role="tab" className="pa-tab" aria-selected={periodo.atalho === dias}
              onClick={() => usarAtalho(dias)}>
              {dias} dias
            </button>
          ))}
        </div>
        <label className="vg-data">
          De
          <input type="date" className="pa-input" value={periodo.de} max={periodo.ate} onChange={(e) => mudarData("de", e.target.value)} />
        </label>
        <label className="vg-data">
          até
          <input type="date" className="pa-input" value={periodo.ate} min={periodo.de} max={hoje()} onChange={(e) => mudarData("ate", e.target.value)} />
        </label>
      </div>

      <div className="vg">{conteudo()}</div>

      {editandoPrecos && (
        <ModalPrecos
          modelosUsados={recurso.status === "ok" ? recurso.dados.ia.por_modelo.map((l) => l.modelo) : []}
          aoFechar={(salvou) => {
            setEditandoPrecos(false);
            if (salvou) recurso.recarregar();
          }}
        />
      )}
    </div>
  );
}