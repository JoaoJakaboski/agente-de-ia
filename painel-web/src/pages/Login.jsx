import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSessao } from "../lib/sessao";
import Botao from "../components/Botao";
import Campo from "../components/Campo";
import Marca from "../components/Marca";
import { BotaoTema } from "../components/MenuTema";
import "./Login.css";

const ALERTAS = {
  credenciais_invalidas: { tipo: "erro", texto: "E-mail ou senha incorretos. Confira e tente de novo." },
  acesso_desativado: { tipo: "aviso", texto: "Seu acesso está desativado. Fale com o administrador da sua empresa." },
  muitas_tentativas: { tipo: "aviso", texto: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo." },
};
const ALERTA_PADRAO = { tipo: "erro", texto: "Não foi possível entrar agora. Tente de novo em instantes." };

export default function Login() {
  const { carregando, usuario, entrar } = useSessao();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoErro, setCodigoErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (!carregando && usuario) return <Navigate to="/atendimentos" replace />;

  async function aoEnviar(evento) {
    evento.preventDefault();
    setCodigoErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (erro) {
      setCodigoErro(erro.codigo || "erro_desconhecido");
    } finally {
      setEnviando(false);
    }
  }

  const alerta = codigoErro && (ALERTAS[codigoErro] || ALERTA_PADRAO);
  const credenciaisInvalidas = codigoErro === "credenciais_invalidas";

  return (
    <div className="login">
      <aside className="login__faixa">
        <Marca texto="Painel de atendimento" invertida />
        <h1 className="login__titulo">Atendimento no WhatsApp com IA e equipe humana trabalhando juntas.</h1>
        <ol className="login__camadas">
          <li>
            <strong>Regras de FAQ</strong>
            <span>Um classificador reconhece a pergunta e responde na hora.</span>
          </li>
          <li>
            <strong>IA classificadora</strong>
            <span>Quando o classificador não tem certeza, a IA entende a intenção.</span>
          </li>
          <li>
            <strong>Agente de IA</strong>
            <span>Conversa com o cliente, coleta as informações e encaminha para a equipe.</span>
          </li>
        </ol>
      </aside>

      <main className="login__area">
        <div className="login__tema">
          <BotaoTema />
        </div>

        <form className="login__form" onSubmit={aoEnviar} noValidate>
          <h2 className="login__form-titulo">Entrar no painel</h2>

          {alerta && (
            <p role="alert" className={`pa-alerta pa-alerta--${alerta.tipo}`}>{alerta.texto}</p>
          )}

          <Campo rotulo="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalido={credenciaisInvalidas} required />
          <Campo rotulo="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} invalido={credenciaisInvalidas} required />

          <Botao type="submit" variante="primario" tamanho="lg" disabled={enviando || !email || !senha}>
            {enviando ? "Entrando…" : "Entrar"}
          </Botao>
          <Link to="/esqueci-senha" className="login__link">Esqueci minha senha</Link>
        </form>
      </main>
    </div>
  );
}