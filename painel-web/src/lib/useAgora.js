import { useEffect, useState } from "react";

// relógio que faz "há 12 min" e o prazo de inatividade andarem sozinhos
export function useAgora(intervaloMs = 30000) {
  const [agora, setAgora] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return agora;
}