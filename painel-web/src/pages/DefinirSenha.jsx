import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Botao from "../components/Botao";
import Campo from "../components/Campo";
import { BotaoTema } from "../components/MenuTema";
import "./Login.css";

const SENHA_MIN = 8;

export default function DefinirSenha() {
  const [parametros] = useSearchParams();
  const [token] = useState(() => parametros.get("token") || "");
  const [estado, setEstado] = useState("verificando"); // verificando | pronto | invalido | concluido
  const [info, setInfo] = useState(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    // o token sai da barra de endereço e do histórico do navegador
    window.history.replaceState(null, "", "/definir-senha");
    if (!token) {
      setEstado("invalido");
      return;
    }
    api("/auth/verificar-token", { metodo: "POST", corpo: { token } })
      .then((dados) => {
        setInfo(dados);
        setEstado("pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  const curta = senha.length > 0 && senha.length < SENHA_MIN;
  const diferentes = confirmacao.length > 0 && senha !== confirmacao;
  const valido = senha.length >= SENHA_MIN && senha === confirmacao;

  async function aoEnviar(evento) {
    evento.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api("/auth/definir-senha", { metodo: "POST", corpo: { token, senha } });
      setEstado("concluido");
    } catch (falha) {
      if (falha.codigo === "token_invalido") setEstado("invalido");
      else if (falha.codigo === "senha_invalida") setErro("Essa senha não foi aceita. Use pelo menos 8 caracteres e evite senhas muito comuns.");
      else if (falha.codigo === "muitas_tentativas") setErro("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.");
      else setErro("Não foi possível salvar a senha. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  function conteudo() {
    if (estado === "verificando") return <p className="login__texto">Conferindo o link…</p>;

    if (estado === "invalido") {
      return (
        <>
          <p role="alert" className="pa-alerta pa-alerta--erro">
            Este link não vale mais. Ele pode ter expirado, já ter sido usado ou ter sido substituído por um mais novo.
          </p>
          <Link to="/esqueci-senha" className="login__link">Pedir um link novo</Link>
        </>
      );
    }

    if (estado === "concluido") {
      return (
        <>
          <p role="status" className="pa-alerta pa-alerta--ok">Senha salva. Agora é só entrar com o seu e-mail e a senha nova.</p>
          <Link to="/login" className="login__link">Ir para o login</Link>
        </>
      );
    }

    const convite = info && info.tipo === "convite";
    const primeiroNome = info && info.nome ? String(info.nome).trim().split(/\s+/)[0] : "";

    return (
      <>
        <p className="login__texto">
          {convite
            ? `Bem-vindo${primeiroNome ? `, ${primeiroNome}` : ""}! Crie a senha que você vai usar para entrar no painel.`
            : `${primeiroNome ? `${primeiroNome}, c` : "C"}rie uma senha nova para o seu acesso.`}
        </p>
        {erro && <p role="alert" className="pa-alerta pa-alerta--erro">{erro}</p>}
        <Campo rotulo="Senha nova" type="password" autoComplete="new-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} invalido={curta}
          ajuda={`Pelo menos ${SENHA_MIN} caracteres.`} autoFocus />
        <Campo rotulo="Repita a senha" type="password" autoComplete="new-password" value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)} invalido={diferentes}
          ajuda={diferentes ? "As senhas não são iguais." : undefined} />
        <Botao type="submit" variante="primario" tamanho="lg" disabled={!valido || enviando}>
          {enviando ? "Salvando…" : "Salvar senha"}
        </Botao>
      </>
    );
  }

  return (
    <div className="login login--simples">
      <main className="login__area">
        <div className="login__tema"><BotaoTema /></div>
        <form className="login__form" onSubmit={aoEnviar} noValidate>
          <h2 className="login__form-titulo">
            {info && info.tipo === "convite" ? "Criar sua senha" : "Definir senha nova"}
          </h2>
          {conteudo()}
        </form>
      </main>
    </div>
  );
}