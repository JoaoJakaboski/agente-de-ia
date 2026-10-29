export const STATUS = {
  bot: { rotulo: "Bot", icone: "bot" },
  agente: { rotulo: "IA coletando informações", icone: "brilho" },
  aguardando_humano: { rotulo: "Aguardando atendente", icone: "relogio" },
  em_atendimento_humano: { rotulo: "Em atendimento", icone: "headset" },
  encerrado: { rotulo: "Encerrado", icone: "checkCirculo" },
};

const ASSUNTOS = {
  orcamento: "Orçamento",
  reclamacao: "Reclamação",
  duvida_nao_respondida: "Dúvida não respondida",
  erro_llm: "Falha da IA",
  problema_pedido: "Problema no pedido",
  status_pedido: "Status do pedido",
  alteracao_cancelamento: "Alteração ou cancelamento",
  desconto_quantidade: "Desconto por quantidade",
  orcamento_3d: "Orçamento de impressão 3D",
  orcamento_laser: "Orçamento de laser",
  orcamento_geral: "Orçamento",
  processo_orcamento: "Orçamento",
  consulta_fabricacao: "Consulta de fabricação",
  criacao_arte: "Criação de arte",
  bot_desligado: "Bot desligado",
  iniciado_pelo_painel: "Iniciado pela equipe",
};

const MOTIVOS_ENCERRAMENTO = {
  resolvido_bot: "Resolvido pelo bot",
  resolvido_humano: "Resolvido",
  abandonado: "Sem resposta do cliente",
  inatividade: "Inatividade",
  fora_do_escopo: "Fora do escopo",
  outro: "Outro motivo",
};

const MIDIAS = {
  imagem: { icone: "imagem", rotulo: "Imagem enviada" },
  documento: { icone: "documento", rotulo: "Documento enviado" },
  video: { icone: "video", rotulo: "Vídeo enviado" },
  audio: { icone: "microfone", rotulo: "Áudio enviado" },
  sticker: { icone: "figurinha", rotulo: "Figurinha enviada" },
};

// intenção sem rótulo cadastrado: "pedido_urgente" vira "Pedido urgente"
function humanizar(valor) {
  const texto = String(valor).replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function rotuloAssunto(valor) {
  if (!valor) return "";
  return ASSUNTOS[valor] || humanizar(valor);
}

export function rotuloMotivoEncerramento(valor) {
  if (!valor) return "";
  return MOTIVOS_ENCERRAMENTO[valor] || humanizar(valor);
}

// o bot grava mídia como "[Mensagem do tipo imagem]"; registros antigos podem estar sem o espaço
export function tipoMidia(conteudo) {
  const resultado = /^\[Mensagem do tipo ?([a-z]+)\]$/i.exec(String(conteudo || "").trim());
  return resultado ? resultado[1].toLowerCase() : null;
}

export function infoMidia(tipo) {
  return MIDIAS[tipo] || { icone: "documento", rotulo: "Mídia enviada" };
}

export function formatarTelefone(bruto) {
  const digitos = String(bruto || "").replace(/\D/g, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const local = digitos.slice(4);
    const corte = local.length - 4;
    return `+55 ${ddd} ${local.slice(0, corte)}-${local.slice(corte)}`;
  }
  return digitos ? `+${digitos}` : "";
}

export function iniciais(nome) {
  const partes = String(nome).trim().split(/\s+/);
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function primeiroNome(nome) {
  return nome ? String(nome).trim().split(/\s+/)[0] : "";
}

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

function mesmoDia(a, b) {
  return a.toDateString() === b.toDateString();
}

export function horaMinuto(iso) {
  return iso ? formatoHora.format(new Date(iso)) : "";
}

// hoje mostra a hora; outros dias mostram a data
export function horaCurta(iso, agora = Date.now()) {
  if (!iso) return "";
  const data = new Date(iso);
  return mesmoDia(data, new Date(agora)) ? formatoHora.format(data) : formatoDiaMes.format(data);
}

export function dataHora(iso) {
  if (!iso) return "—";
  const data = new Date(iso);
  return `${formatoDiaMes.format(data)} ${formatoHora.format(data)}`;
}

export function rotuloDia(iso, agora = Date.now()) {
  const data = new Date(iso);
  if (mesmoDia(data, new Date(agora))) return "Hoje";
  if (mesmoDia(data, new Date(agora - 24 * 60 * 60 * 1000))) return "Ontem";
  return formatoDiaMes.format(data);
}

export function minutosDesde(iso, agora) {
  return iso ? Math.max(0, Math.floor((agora - Date.parse(iso)) / 60000)) : 0;
}

export function duracao(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

export function numero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

// remove *_~` e ``` para a prévia em uma linha
function semFormatacao(texto) {
  let limpo = String(texto).replace(/```/g, "");
  const marcacao = /(?<![\p{L}\p{N}])([*_~`])(?=\S)(.*?\S)\1(?![\p{L}\p{N}])/gu;
  for (let i = 0; i < 2; i++) limpo = limpo.replace(marcacao, "$2"); // duas passadas: *_assim_*
  return limpo;
}

export function previaMensagem(chamado) {
  if (!chamado.ultima_mensagem) return "Sem mensagens";
  const midia = tipoMidia(chamado.ultima_mensagem);
  const texto = midia ? infoMidia(midia).rotulo : chamado.ultima_mensagem.replace(/\s+/g, " ");

  if (chamado.ultima_mensagem_remetente === "bot") return `Bot: ${texto}`;
  if (chamado.ultima_mensagem_remetente === "humano") {
    return `${primeiroNome(chamado.atendente_nome) || "Equipe"}: ${texto}`;
  }
  return texto;
}

// linhas de sistema da conversa, a partir do histórico de status
export function textoEvento(evento) {
  // sem status anterior = abertura do chamado ou ponto de partida importado: não vira linha
  if (!evento.status_anterior) return null;

  switch (evento.status_novo) {
    case "aguardando_humano":
      return evento.motivo
        ? `Encaminhado para atendente · ${rotuloAssunto(evento.motivo)}`
        : "Encaminhado para atendente";
    case "em_atendimento_humano":
      return evento.atendente_nome ? `${evento.atendente_nome} assumiu o atendimento` : "A equipe assumiu pelo WhatsApp";
    case "bot":
      return evento.status_anterior === "em_atendimento_humano" ? "Devolvido ao bot" : null;
    case "encerrado":
      if (evento.motivo === "inatividade") return "Chamado encerrado por inatividade";
      return evento.motivo
        ? `Atendimento encerrado · ${rotuloMotivoEncerramento(evento.motivo)}`
        : "Atendimento encerrado";
    default:
      return null;
  }
}