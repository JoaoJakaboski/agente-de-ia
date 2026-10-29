import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import { useSessao } from "../../lib/sessao";
import Botao from "../../components/Botao";
import Chave from "../../components/Chave";
import Icone from "../../components/Icone";
import { EstadoErro, Esqueleto } from "../../components/Estados";
import "./admin.css";

const LIMITE_PROMPT = 20000;

function comVirgula(numero) {
  return String(numero).replace(".", ",");
}

function lerNumero(texto) {
  const numero = Number(String(texto).trim().replace(",", "."));
  return String(texto).trim() === "" ? NaN : numero;
}

function paraFormulario(configuracao) {
  return {
    systemPrompt: configuracao.system_prompt || "",
    modelo: configuracao.modelo,
    limiar: Number(configuracao.limiar_faq),
    segundos: String(configuracao.segundos_debounce),
    horas: comVirgula(configuracao.horas_inatividade_chamado),
    ativo: configuracao.ativo,
  };
}

function validar(form) {
  const segundos = Number(form.segundos);
  const horas = lerNumero(form.horas);
  return {
    prompt: form.systemPrompt.trim().length > 0 && form.systemPrompt.length <= LIMITE_PROMPT,
    segundos: Number.isInteger(segundos) && segundos >= 1 && segundos <= 60,
    horas: Number.isFinite(horas) && horas >= 0.05 && horas <= 720,
  };
}

export default function Agente() {
  const { usuario } = useSessao();
  const recurso = useRecurso(() => api("/admin/agente"), []);
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  const [modelos, setModelos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (recurso.status !== "ok") return;
    const inicial = paraFormulario(recurso.dados.configuracao);
    setForm(inicial);
    setOriginal(inicial);
    setModelos(recurso.dados.modelos);
  }, [recurso.status, recurso.dados]);

  if (recurso.status === "erro") {
    return (
      <div className="pa-page">
        <EstadoErro titulo="Não foi possível carregar as configurações" aoTentar={recurso.recarregar} />
      </div>
    );
  }
  if (!form) {
    return <div className="pa-page"><Esqueleto linhas={8} /></div>;
  }

  const validacao = validar(form);
  const valido = validacao.prompt && validacao.segundos && validacao.horas;
  const alterado = JSON.stringify(form) !== JSON.stringify(original);
  const alterar = (campo) => (valor) => {
    setResultado(null);
    setForm((atual) => ({ ...atual, [campo]: valor }));
  };

  // um modelo antigo, que não está mais na lista, continua aparecendo como opção
  const opcoesModelo = modelos.some((modelo) => modelo.id === form.modelo)
    ? modelos
    : [...modelos, { id: form.modelo, nome: form.modelo, descricao: "Modelo atual, fora da lista recomendada." }];
  const modeloEscolhido = opcoesModelo.find((modelo) => modelo.id === form.modelo);
  const limiarTexto = form.limiar.toFixed(2).replace(".", ",");

  async function salvar() {
    setSalvando(true);
    setResultado(null);
    try {
      const resposta = await api("/admin/agente", {
        metodo: "PUT",
        corpo: {
          systemPrompt: form.systemPrompt,
          modelo: form.modelo,
          limiarFaq: form.limiar,
          segundosDebounce: Number(form.segundos),
          horasInatividade: lerNumero(form.horas),
          ativo: form.ativo,
        },
      });
      const salvo = paraFormulario(resposta.configuracao);
      setForm(salvo);
      setOriginal(salvo);
      setResultado({ tipo: "ok", texto: "Alterações salvas. O bot já usa a nova configuração." });
    } catch {
      setResultado({ tipo: "erro", texto: "Não foi possível salvar. Confira os campos e tente de novo." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pa-page">
      <header className="pa-page__hd">
        <div>
          <h1 className="pa-page__title">Agente</h1>
          <p className="pa-page__sub">Como o bot e a IA atendem no WhatsApp da {usuario.empresaNome}.</p>
        </div>
      </header>

      {!form.ativo && (
        <div className="pa-alert pa-alert--warn admin__aviso" role="status">
          <Icone nome="alerta" />
          <span>
            Bot desligado: as mensagens novas vão direto para “Aguardando atendente”, sem respostas automáticas.
            O aviso de privacidade continua sendo enviado.
          </span>
        </div>
      )}

      {resultado && (
        <p className={`pa-alert ${resultado.tipo === "ok" ? "pa-alert--info" : "pa-alert--error"} admin__aviso`} role="status">
          <Icone nome={resultado.tipo === "ok" ? "checkCirculo" : "alerta"} />
          {resultado.texto}
        </p>
      )}

      <div className="admin-agente">
        <section className="pa-card admin-agente__bloco">
          <div className="pa-campo">
            <label htmlFor="agente-prompt" className="pa-campo__rotulo">Prompt do agente</label>
            <p className="pa-campo__ajuda">
              É a base de conhecimento do agente de IA. Inclua materiais aceitos e recusados, limites das máquinas,
              formatos de arquivo, formas de pagamento, entrega e o tom de voz da empresa.
            </p>
            <textarea
              id="agente-prompt"
              className={`pa-textarea admin-agente__prompt${validacao.prompt ? "" : " pa-campo__input--invalido"}`}
              value={form.systemPrompt}
              maxLength={LIMITE_PROMPT}
              onChange={(evento) => alterar("systemPrompt")(evento.target.value)}
            />
            <p className="pa-campo__ajuda">{form.systemPrompt.length.toLocaleString("pt-BR")}/{LIMITE_PROMPT.toLocaleString("pt-BR")}</p>
          </div>
        </section>

        <section className="pa-card admin-agente__bloco">
          <Chave
            rotulo="Bot ativo"
            marcada={form.ativo}
            aoMudar={alterar("ativo")}
            ajuda="Desligado, o bot não responde: toda conversa vai para a equipe."
          />

          <div className="pa-campo">
            <label htmlFor="agente-modelo" className="pa-campo__rotulo">Modelo de IA</label>
            <select id="agente-modelo" className="pa-input" value={form.modelo}
              onChange={(evento) => alterar("modelo")(evento.target.value)}>
              {opcoesModelo.map((modelo) => (
                <option key={modelo.id} value={modelo.id}>{modelo.nome}</option>
              ))}
            </select>
            {modeloEscolhido && <p className="pa-campo__ajuda">{modeloEscolhido.descricao}</p>}
          </div>

          <div className="pa-campo">
            <label htmlFor="agente-limiar" className="pa-campo__rotulo admin-agente__rotulo-valor">
              Limiar de confiança do classificador
              <span className="pa-mono">{limiarTexto}</span>
            </label>
            <input id="agente-limiar" type="range" className="pa-range" min={0} max={1} step={0.01}
              value={form.limiar} onChange={(evento) => alterar("limiar")(Number(evento.target.value))} />
            <div className="admin-agente__zonas">
              <span>Acima de {limiarTexto}: a regra de FAQ responde direto.</span>
              <span>Abaixo: a mensagem vai para a IA decidir.</span>
            </div>
          </div>

          <div className="pa-campo">
            <label htmlFor="agente-segundos" className="pa-campo__rotulo">Tempo de agrupamento (segundos)</label>
            <input id="agente-segundos" className={`pa-campo__input${validacao.segundos ? "" : " pa-campo__input--invalido"}`}
              inputMode="numeric" value={form.segundos} onChange={(evento) => alterar("segundos")(evento.target.value)} />
            <p className="pa-campo__ajuda">
              {validacao.segundos
                ? "O bot espera o cliente terminar de mandar várias mensagens seguidas antes de responder."
                : "Use um número inteiro entre 1 e 60."}
            </p>
          </div>

          <div className="pa-campo">
            <label htmlFor="agente-horas" className="pa-campo__rotulo">Encerrar por inatividade após (horas)</label>
            <input id="agente-horas" className={`pa-campo__input${validacao.horas ? "" : " pa-campo__input--invalido"}`}
              inputMode="decimal" value={form.horas} onChange={(evento) => alterar("horas")(evento.target.value)} />
            <p className="pa-campo__ajuda">
              {validacao.horas
                ? "Vale só para conversas com o bot. Aceita decimais, como 0,5 (meia hora)."
                : "Use um número entre 0,05 e 720."}
            </p>
          </div>
        </section>
      </div>

      <div className="admin-agente__barra">
        <span className="admin-agente__estado">{alterado ? "Há alterações não salvas." : "Tudo salvo."}</span>
        <Botao disabled={!alterado || salvando} onClick={() => setForm(original)}>Descartar</Botao>
        <Botao variante="primario" disabled={!alterado || !valido || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar alterações"}
        </Botao>
      </div>
    </div>
  );
}