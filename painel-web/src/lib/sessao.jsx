import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const SessaoContext = createContext(null);

export function SessaoProvider({ children }) {
  const [estado, setEstado] = useState({ carregando: true, usuario: null });

  useEffect(() => {
    api("/auth/sessao")
      .then((dados) => setEstado({ carregando: false, usuario: dados.usuario }))
      .catch(() => setEstado({ carregando: false, usuario: null }));
  }, []);

  useEffect(() => {
    const aoExpirar = () => setEstado({ carregando: false, usuario: null });
    window.addEventListener("pa:sessao-expirada", aoExpirar);
    return () => window.removeEventListener("pa:sessao-expirada", aoExpirar);
  }, []);

  async function entrar(email, senha) {
    const dados = await api("/auth/login", { metodo: "POST", corpo: { email, senha } });
    setEstado({ carregando: false, usuario: dados.usuario });
  }

  async function sair() {
    try {
      await api("/auth/logout", { metodo: "POST" });
    } finally {
      setEstado({ carregando: false, usuario: null });
    }
  }

  return (
    <SessaoContext.Provider value={{ ...estado, entrar, sair }}>
      {children}
    </SessaoContext.Provider>
  );
}

export function useSessao() {
  return useContext(SessaoContext);
}