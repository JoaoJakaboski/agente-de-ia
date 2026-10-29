import { useState } from "react";
import { api } from "../../lib/api";
import Gaveta from "../../components/Gaveta";
import Botao from "../../components/Botao";
import Chave from "../../components/Chave";
import Icone from "../../components/Icone";
import TextoWhatsapp from "../../components/TextoWhatsapp";

const FORMATO_INTENCAO = /^[a-z0-9_]{2,60}$/;
const LIMITE_RESPOSTA = 4000;

const ERROS = {
  intencao_duplicada: "Já existe uma regra com essa intenção.",
  intencao_invalida: "Use só letras minúsculas, números e _ na intenção, de 2 a 60 caracteres.",
  dados_invalidos: "Confira os campos: a resposta é obrigatória.",
};

export default function PainelRegra({ regra, aoFechar, aoSalvar }) {
  const nova = !regra;
  const [form, setForm] = useState(() => ({
    intencao: regra ? regra.intencao : "",
    descricao: regra ? regra.descricao_intencao || "" : "",
    resposta: regra ? regra.resposta : "",
    ativo: regra ? regra.ativo : true,
    escalarHumano: regra ? regra.escalar_humano : false,
    iniciaAgente: regra ? regra.inicia_agente : false,
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const intencaoValida = !nova || FORMATO_INTENCAO.test(form.intencao);
  const valido = intencaoValida && form.resposta.trim().length > 0;
  const alterar = (campo) => (valor) => setForm((atual) => ({ ...atual, [campo]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo = {
      descricao: form.descricao,
      resposta: form.resposta,
      ativo: form.ativo,
      escalarHumano: form.escalarHumano,
      iniciaAgente: form.escalarHumano ? false : form.iniciaAgente,
    };
    try {
      const resposta = nova
        ? await api("/admin/regras", { metodo: "POST", corpo: { ...corpo, intencao: form.intencao } })
        : await api(`/admin/regras/${regra.id}`, { metodo: "PATCH", corpo });
      aoSalvar(resposta.regra);
    } catch (falha) {
      setErro(ERROS[falha.codigo] || "Não foi possível salvar a regra. Tente de novo.");
      setSalvando(false);
    }
  }

  return (
    <Gaveta
      titulo={nova ? "Nova regra" : "Editar regra"}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar regra"}
          </Botao>
        </>
      }
    >
      {nova && (
        <div className="pa-alert pa-alert--info">
          <Icone nome="info" />
          <span>
            O classificador de machine learning só reconhece uma intenção nova depois de um novo treinamento.
            Até lá, quem a reconhece é a IA da camada 2, pela descrição.
          </span>
        </div>
      )}

      {erro && (
        <p className="pa-alert pa-alert--error" role="alert">
          <Icone nome="alerta" />
          {erro}
        </p>
      )}

      <div className="pa-campo">
        <label htmlFor="regra-intencao" className="pa-campo__rotulo">Intenção</label>
        <input
          id="regra-intencao"
          className={`pa-campo__input pa-mono${!intencaoValida && form.intencao ? " pa-campo__input--invalido" : ""}`}
          value={form.intencao}
          maxLength={60}
          disabled={!nova}
          onChange={(evento) => alterar("intencao")(evento.target.value.toLowerCase())}
        />
        <p className="pa-campo__ajuda">
          {nova
            ? "Identificador usado pelo classificador: letras minúsculas, números e _. Não pode ser alterado depois."
            : "O identificador não pode ser alterado, porque o classificador depende dele."}
        </p>
      </div>

      <div className="pa-campo">
        <label htmlFor="regra-descricao" className="pa-campo__rotulo">Descrição</label>
        <textarea id="regra-descricao" className="pa-textarea" rows={3} maxLength={500}
          value={form.descricao} onChange={(evento) => alterar("descricao")(evento.target.value)} />
        <p className="pa-campo__ajuda">
          A IA usa este texto para reconhecer quando o cliente fala disso. Descreva com as palavras que o cliente costuma usar.
        </p>
      </div>

      <div className="pa-campo">
        <label htmlFor="regra-resposta" className="pa-campo__rotulo">Resposta</label>
        <textarea id="regra-resposta" className="pa-textarea" rows={6} maxLength={LIMITE_RESPOSTA}
          value={form.resposta} onChange={(evento) => alterar("resposta")(evento.target.value)} />
        <p className="pa-campo__ajuda">
          Aceita a formatação do WhatsApp: *negrito*, _itálico_ e ~tachado~. {form.resposta.length}/{LIMITE_RESPOSTA}
        </p>
      </div>

      <div className="admin__chaves">
        <Chave rotulo="Ativa" marcada={form.ativo} aoMudar={alterar("ativo")}
          ajuda="Regra inativa nunca é usada pelo bot." />
        <Chave rotulo="Escala para humano" marcada={form.escalarHumano} aoMudar={alterar("escalarHumano")}
          ajuda="Depois de enviar a resposta, o chamado vai para a fila “Aguardando atendente”." />
        <Chave
          rotulo="Inicia agente"
          marcada={form.iniciaAgente && !form.escalarHumano}
          desabilitada={form.escalarHumano}
          aoMudar={alterar("iniciaAgente")}
          ajuda={
            form.escalarHumano
              ? "Sem efeito: a regra escala para humano, e isso tem prioridade."
              : "Use quando a resposta pede dados ao cliente: a conversa continua com o agente de IA."
          }
        />
      </div>

      <div className="pa-campo">
        <p className="pa-campo__rotulo">Prévia no WhatsApp</p>
        <div className="pa-wapreview">
          <div className="pa-msg pa-msg--out pa-msg--bot">
            <span className="pa-msg__who"><Icone nome="bot" />Bot</span>
            <div className="pa-bubble">
              {form.resposta.trim() ? <TextoWhatsapp texto={form.resposta} /> : <span className="pa-faint">A resposta aparece aqui.</span>}
            </div>
          </div>
        </div>
      </div>
    </Gaveta>
  );
}