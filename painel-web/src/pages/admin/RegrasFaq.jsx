import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import Botao from "../../components/Botao";
import Chave from "../../components/Chave";
import Dica from "../../components/Dica";
import Icone from "../../components/Icone";
import TextoWhatsapp from "../../components/TextoWhatsapp";
import { EstadoErro, EstadoVazio, Esqueleto } from "../../components/Estados";
import PainelRegra from "./PainelRegra";
import "./admin.css";

const COLUNAS = { ativo: "ativo", escalarHumano: "escalar_humano", iniciaAgente: "inicia_agente" };

const DICAS = {
  descricao: "A IA da camada 2 usa a descrição para reconhecer a intenção quando o classificador não tem certeza.",
  escalar: "Depois de enviar a resposta, o chamado vai para a fila “Aguardando atendente”.",
  agente: "A resposta pede dados ao cliente; a conversa continua com o agente de IA. Não tem efeito quando a regra escala para humano.",
};

function aplicarAlteracao(regra, campo, valor) {
  const nova = { ...regra, [COLUNAS[campo]]: valor };
  if (campo === "escalarHumano" && valor) nova.inicia_agente = false;
  return nova;
}

export default function RegrasFaq() {
  const recurso = useRecurso(() => api("/admin/regras").then((dados) => dados.regras), []);
  const [regras, setRegras] = useState(null);
  const [busca, setBusca] = useState("");
  const [edicao, setEdicao] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (recurso.status === "ok") setRegras(recurso.dados);
  }, [recurso.status, recurso.dados]);

  async function alternar(regra, campo, valor) {
    const anteriores = regras;
    setAviso(null);
    setRegras((atuais) => atuais.map((item) => (item.id === regra.id ? aplicarAlteracao(item, campo, valor) : item)));
    try {
      const { regra: salva } = await api(`/admin/regras/${regra.id}`, { metodo: "PATCH", corpo: { [campo]: valor } });
      setRegras((atuais) => atuais.map((item) => (item.id === salva.id ? salva : item)));
    } catch {
      setRegras(anteriores);
      setAviso("Não foi possível salvar a alteração. Tente de novo.");
    }
  }

  function aoSalvarRegra(salva) {
    setRegras((atuais) => {
      const existe = atuais.some((item) => item.id === salva.id);
      const lista = existe ? atuais.map((item) => (item.id === salva.id ? salva : item)) : [...atuais, salva];
      return lista.sort((a, b) => a.intencao.localeCompare(b.intencao));
    });
    setEdicao(null);
  }

  const termo = busca.trim().toLowerCase();
  const filtradas = (regras || []).filter(
    (regra) =>
      !termo ||
      regra.intencao.includes(termo) ||
      (regra.descricao_intencao || "").toLowerCase().includes(termo) ||
      regra.resposta.toLowerCase().includes(termo)
  );

  function conteudo() {
    if (recurso.status === "carregando" || (recurso.status === "ok" && !regras)) return <Esqueleto linhas={6} />;
    if (recurso.status === "erro") {
      return <EstadoErro titulo="Não foi possível carregar as regras" aoTentar={recurso.recarregar} />;
    }
    if (regras.length === 0) {
      return (
        <EstadoVazio
          icone="lista"
          titulo="Nenhuma regra cadastrada"
          texto="As regras são as respostas prontas que o bot envia quando reconhece a intenção do cliente."
          acao={<Botao variante="primario" icone={<Icone nome="mais" />} onClick={() => setEdicao({ nova: true })}>Nova regra</Botao>}
        />
      );
    }
    if (filtradas.length === 0) {
      return <EstadoVazio icone="busca" titulo="Nada encontrado" texto="Nenhuma regra com esse termo." />;
    }

    return (
      <div className="pa-card admin__tabela">
        <table className="pa-table">
          <thead>
            <tr>
              <th>Intenção</th>
              <th>Descrição <Dica texto={DICAS.descricao} /></th>
              <th>Resposta</th>
              <th>Ativa</th>
              <th>Escala para humano <Dica texto={DICAS.escalar} /></th>
              <th>Inicia agente <Dica texto={DICAS.agente} /></th>
              <th><span className="pa-vh">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((regra) => (
              <tr key={regra.id} className={regra.ativo ? undefined : "admin__inativa"}>
                <td>
                  <div className="pa-mono">{regra.intencao}</div>
                  {regra.interna && <span className="pa-tag-int">Interna</span>}
                  {!regra.ativo && <div className="admin__rotulo-inativa">Inativa</div>}
                </td>
                <td>{regra.descricao_intencao || <span className="pa-faint">Sem descrição</span>}</td>
                <td><span className="admin__resposta"><TextoWhatsapp texto={regra.resposta} /></span></td>
                <td>
                  <Chave rotuloOculto rotulo={`Ativa: ${regra.intencao}`} marcada={regra.ativo}
                    aoMudar={(valor) => alternar(regra, "ativo", valor)} />
                </td>
                <td>
                  <Chave rotuloOculto rotulo={`Escala para humano: ${regra.intencao}`} marcada={regra.escalar_humano}
                    aoMudar={(valor) => alternar(regra, "escalarHumano", valor)} />
                </td>
                <td>
                  <Chave rotuloOculto rotulo={`Inicia agente: ${regra.intencao}`}
                    marcada={regra.inicia_agente && !regra.escalar_humano}
                    desabilitada={regra.escalar_humano}
                    aoMudar={(valor) => alternar(regra, "iniciaAgente", valor)} />
                  {regra.escalar_humano && <span className="admin__sem-efeito">sem efeito</span>}
                </td>
                <td>
                  <button type="button" className="pa-iconbtn" aria-label={`Editar regra ${regra.intencao}`}
                    onClick={() => setEdicao({ regra })}>
                    <Icone nome="editar" />
                  </button>
                </td>
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
          <h1 className="pa-page__title">Regras de FAQ</h1>
          <p className="pa-page__sub">Respostas prontas que o bot envia quando reconhece a intenção do cliente.</p>
        </div>
        <Botao variante="primario" icone={<Icone nome="mais" />} onClick={() => setEdicao({ nova: true })}>Nova regra</Botao>
      </header>

      <div className="admin__filtros">
        <div className="pa-search">
          <Icone nome="busca" />
          <input className="pa-input" type="search" placeholder="Buscar por intenção, descrição ou resposta"
            aria-label="Buscar regras" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
        </div>
      </div>

      {aviso && (
        <p className="pa-alert pa-alert--error admin__aviso" role="alert">
          <Icone nome="alerta" />
          {aviso}
        </p>
      )}

      {conteudo()}

      {edicao && (
        <PainelRegra regra={edicao.regra} aoFechar={() => setEdicao(null)} aoSalvar={aoSalvarRegra} />
      )}
    </div>
  );
}