import { createContext, useContext, useEffect, useState } from "react";

const CHAVE = "pa-tema";
const consultaEscuro = "(prefers-color-scheme: dark)";

export function lerPreferenciaTema() {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === "claro" || valor === "escuro" ? valor : "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(preferencia) {
  const raiz = document.documentElement;
  if (preferencia === "claro") raiz.dataset.theme = "light";
  else if (preferencia === "escuro") raiz.dataset.theme = "dark";
  else delete raiz.dataset.theme;
}

const TemaContext = createContext(null);

export function TemaProvider({ children }) {
  const [preferencia, setPreferencia] = useState(lerPreferenciaTema);
  const [sistemaEscuro, setSistemaEscuro] = useState(() => window.matchMedia(consultaEscuro).matches);

  useEffect(() => {
    const midia = window.matchMedia(consultaEscuro);
    const aoMudar = (evento) => setSistemaEscuro(evento.matches);
    midia.addEventListener("change", aoMudar);
    return () => midia.removeEventListener("change", aoMudar);
  }, []);

  function definirTema(nova) {
    setPreferencia(nova);
    aplicarTema(nova);
    try {
      if (nova === "sistema") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, nova);
    } catch {
      // sem armazenamento (aba anônima, por exemplo): vale só até recarregar
    }
  }

  const temaEfetivo = preferencia === "sistema" ? (sistemaEscuro ? "escuro" : "claro") : preferencia;

  return (
    <TemaContext.Provider value={{ preferencia, temaEfetivo, definirTema }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema() {
  return useContext(TemaContext);
}