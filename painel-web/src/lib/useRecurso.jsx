import { useCallback, useEffect, useRef, useState } from "react";

export function useRecurso(carregar, deps) {
  const [estado, setEstado] = useState({ status: "carregando", dados: null, erro: null });
  const versao = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(async (silencioso) => {
    const minhaVersao = ++versao.current;
    if (!silencioso) setEstado({ status: "carregando", dados: null, erro: null });

    try {
      const dados = await carregar();
      if (minhaVersao === versao.current) setEstado({ status: "ok", dados, erro: null });
    } catch (erro) {
      if (minhaVersao !== versao.current) return;
      // falha numa atualização silenciosa mantém o que já estava na tela
      setEstado((atual) => (silencioso && atual.status === "ok" ? atual : { status: "erro", dados: null, erro }));
    }
  }, deps);

  useEffect(() => {
    executar(false);
  }, [executar]);

  return { ...estado, recarregar: () => executar(true) };
}