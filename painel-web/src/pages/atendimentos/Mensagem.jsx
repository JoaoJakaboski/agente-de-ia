import Icone from "../../components/Icone";
import { horaMinuto, infoMidia, tipoMidia } from "../../lib/formatos";
import TextoWhatsapp from "../../components/TextoWhatsapp";

function Corpo({ conteudo }) {
  const midia = tipoMidia(conteudo);
  if (!midia) return <TextoWhatsapp texto={conteudo} />;
  const { icone, rotulo } = infoMidia(midia);
  return (
    <span className="pa-media">
      <Icone nome={icone} />
      {rotulo}
    </span>
  );
}

export function Mensagem({ mensagem, avisoPrivacidade }) {
  const hora = <span className="pa-bubble__time">{horaMinuto(mensagem.criado_em)}</span>;

  if (mensagem.remetente === "cliente") {
    return (
      <div className="pa-msg pa-msg--in">
        <div className="pa-bubble">
          <Corpo conteudo={mensagem.conteudo} />
          {hora}
        </div>
      </div>
    );
  }

  const doBot = mensagem.remetente === "bot";
  return (
    <div className={`pa-msg pa-msg--out ${doBot ? "pa-msg--bot" : "pa-msg--human"}`}>
      <span className="pa-msg__who">
        <Icone nome={doBot ? "bot" : "headset"} />
        {doBot ? "Bot" : mensagem.atendente_nome || "Equipe · WhatsApp"}
      </span>
      <div className="pa-bubble">
        {avisoPrivacidade && (
          <div className="pa-lgpd">
            <Icone nome="escudo" />
            Aviso de privacidade
          </div>
        )}
        <Corpo conteudo={mensagem.conteudo} />
        {hora}
      </div>
    </div>
  );
}

export function LinhaSistema({ texto, em }) {
  return (
    <div className="pa-sysline">
      <Icone nome="info" />
      {texto} · {horaMinuto(em)}
    </div>
  );
}