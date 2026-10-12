import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

const TempoRealContext = createContext(null);
const TOLERANCIA_QUEDA_MS = 5000;

export function TempoRealProvider({ children }) {
  const [offlineDesde, setOfflineDesde] = useState(null);
  const [contagens, setContagens] = useState(null);
  const ouvintes = useRef(new Set());

  const atualizarContagens = useCallback(() => {
    api("/chamados/contagens").then(setContagens).catch(() => {});
  }, []);

  useEffect(() => {
    const SEM_SINAL_MS = 60000;
    let fonte = null;
    let encerrado = false;
    let primeiraConexao = true;
    let timerQueda = null;
    let timerContagens = null;
    let ultimoSinal = Date.now();

    const avisar = (tipo, dados) => ouvintes.current.forEach((ouvinte) => ouvinte(tipo, dados));

    function marcarQueda() {
      if (timerQueda) return;
      timerQueda = setTimeout(() => setOfflineDesde(Date.now()), TOLERANCIA_QUEDA_MS);
    }

    function marcarOnline() {
      clearTimeout(timerQueda);
      timerQueda = null;
      setOfflineDesde(null);
    }

    function agendarContagens() {
      clearTimeout(timerContagens);
      timerContagens = setTimeout(atualizarContagens, 400);
    }

    // todo evento recebido, inclusive o "ping", prova que a conexão está viva
    function receber(tipo, aoReceber) {
      fonte.addEventListener(tipo, (evento) => {
        ultimoSinal = Date.now();
        if (aoReceber) aoReceber(JSON.parse(evento.data));
      });
    }

    function conectar() {
      ultimoSinal = Date.now();
      fonte = new EventSource("/api/eventos");

      receber("ping");

      receber("estado", ({ online }) => {
        if (!online) return marcarQueda();
        marcarOnline();
        // depois de uma queda, recarrega o que pode ter mudado no intervalo
        if (!primeiraConexao) {
          avisar("reconectado");
          atualizarContagens();
        }
        primeiraConexao = false;
      });

      receber("chamado", (dados) => {
        avisar("chamado", dados);
        agendarContagens();
      });

      receber("mensagem", (dados) => avisar("mensagem", dados));

      fonte.onerror = () => {
        marcarQueda();
        // o navegador reconecta sozinho, exceto quando o servidor recusa (ex.: sessão expirada)
        if (fonte.readyState !== EventSource.CLOSED || encerrado) return;
        api("/auth/sessao")
          .then(() => setTimeout(() => !encerrado && conectar(), 3000))
          .catch((erro) => {
            if (erro.status === 401 || erro.status === 403) {
              window.dispatchEvent(new Event("pa:sessao-expirada"));
            } else {
              setTimeout(() => !encerrado && conectar(), 5000);
            }
          });
      };
    }

    conectar();
    atualizarContagens();

    // conexão aberta mas muda (servidor caiu sem fechá-la): força uma nova
    const vigia = setInterval(() => {
      if (encerrado || Date.now() - ultimoSinal < SEM_SINAL_MS) return;
      marcarQueda();
      if (fonte) fonte.close();
      conectar();
    }, 15000);

    return () => {
      encerrado = true;
      clearInterval(vigia);
      if (fonte) fonte.close();
      clearTimeout(timerQueda);
      clearTimeout(timerContagens);
    };
  }, [atualizarContagens]);

  const ouvir = useCallback((ouvinte) => {
    ouvintes.current.add(ouvinte);
    return () => {
      ouvintes.current.delete(ouvinte);
    };
  }, []);

  return (
    <TempoRealContext.Provider value={{ offlineDesde, contagens, ouvir, atualizarContagens }}>
      {children}
    </TempoRealContext.Provider>
  );
}

export function useTempoReal() {
  return useContext(TempoRealContext);
}

// recebe os avisos ("chamado", "mensagem", "reconectado") enquanto o componente estiver na tela
export function useEventos(aoReceber) {
  const { ouvir } = useTempoReal();
  const referencia = useRef(aoReceber);

  useEffect(() => {
    referencia.current = aoReceber;
  });

  useEffect(() => ouvir((tipo, dados) => referencia.current(tipo, dados)), [ouvir]);
}