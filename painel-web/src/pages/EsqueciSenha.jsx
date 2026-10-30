import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import Botao from "../components/Botao";
import Campo from "../components/Campo";
import { BotaoTema } from "../components/MenuTema";
import "./Login.css";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState("inicial"); // inicial | enviando | enviado | limite | erro

  async function aoEnviar(evento) {
    evento.preventDefault();
    setEstado("enviando");
    try {
      await api("/auth/esqueci-senha", { metodo: "POST", corpo: { email } });
      setEstado("enviado");
    } catch (erro) {
      setEstado(erro.codigo === "muitas_tentativas" ? "limite" : "erro");
    }
  }

  return (
    <div className="login login--simples">
      <main className="login__area">
        <div className="login__tema"><BotaoTema /></div>

        <form className="login__form" onSubmit={aoEnviar} noValidate>
          <h2 className="login__form-titulo">Esqueci minha senha</h2>

          {estado === "enviado" ? (
            <p role="status" className="pa-alerta pa-alerta--ok">
              Se o e-mail estiver cadastrado, você vai receber um link para criar uma senha nova. Ele vale por 1 hora.
              Confira também a caixa de spam.
            </p>
          ) : (
            <>
              <p className="login__texto">Informe o e-mail do seu acesso. Vamos enviar um link para você criar uma senha nova.</p>
              {estado === "limite" && (
                <p role="alert" className="pa-alerta pa-alerta--aviso">Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.</p>
              )}
              {estado === "erro" && (
                <p role="alert" className="pa-alerta pa-alerta--erro">Não foi possível enviar agora. Tente de novo em instantes.</p>
              )}
              <Campo rotulo="E-mail" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <Botao type="submit" variante="primario" tamanho="lg" disabled={estado === "enviando" || !email.trim()}>
                {estado === "enviando" ? "Enviando…" : "Enviar link"}
              </Botao>
            </>
          )}

          <Link to="/login" className="login__link">Voltar para o login</Link>
        </form>
      </main>
    </div>
  );
}