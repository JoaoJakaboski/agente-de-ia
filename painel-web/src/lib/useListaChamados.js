import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const TAMANHO_PAGINA = 30;
const INICIAL = { status: "carregando", dados: [], temMais: false, carregandoMais: false, erro: null };

export function useListaChamados(fila, busca) {
  const [estado, setEstado] = useState(INICIAL);
  const versao = useRef(0);
  const quantidade = useRef(TAMANHO_PAGINA);
  const carregandoMais = useRef(false);
  const atual = useRef(estado);
  atual.current = estado;

  const buscar = useCallback(
    (deslocamento, limite) => {
      const parametros = new URLSearchParams({ fila, limite: String(limite), deslocamento: String(deslocamento) });
      if (busca) parametros.set("busca", busca);
      return api(`/chamados?${parametros}`);
    },
    [fila, busca]
  );

  // troca de aba ou de busca: volta para a primeira página
  useEffect(() => {
    const minhaVersao = ++versao.current;
    quantidade.current = TAMANHO_PAGINA;
    carregandoMais.current = false;
    setEstado(INICIAL);

    buscar(0, TAMANHO_PAGINA)
      .then((resposta) => {
        if (minhaVersao !== versao.current) return;
        setEstado({ ...INICIAL, status: "ok", dados: resposta.chamados, temMais: resposta.temMais });
      })
      .catch((erro) => {
        if (minhaVersao === versao.current) setEstado({ ...INICIAL, status: "erro", erro });
      });
  }, [buscar]);

  // tempo real ou "Tentar de novo": recarrega de uma vez tudo o que já está na tela
  const recarregar = useCallback(() => {
    const minhaVersao = ++versao.current;
    carregandoMais.current = false;
    buscar(0, quantidade.current)
      .then((resposta) => {
        if (minhaVersao !== versao.current) return;
        setEstado((anterior) => ({
          ...anterior,
          status: "ok",
          erro: null,
          dados: resposta.chamados,
          temMais: resposta.temMais,
          carregandoMais: false,
        }));
      })
      .catch((erro) => {
        if (minhaVersao !== versao.current) return;
        setEstado((anterior) => (anterior.status === "ok" ? anterior : { ...INICIAL, status: "erro", erro }));
      });
  }, [buscar]);

  const carregarMais = useCallback(() => {
    const { status, temMais, dados } = atual.current;
    if (status !== "ok" || !temMais || carregandoMais.current) return;

    carregandoMais.current = true;
    const minhaVersao = versao.current;
    const deslocamento = dados.length;
    setEstado((anterior) => ({ ...anterior, carregandoMais: true }));

    buscar(deslocamento, TAMANHO_PAGINA)
      .then((resposta) => {
        if (minhaVersao !== versao.current) return;
        quantidade.current = deslocamento + resposta.chamados.length;
        setEstado((anterior) => {
          // um chamado pode ter mudado de posição entre uma página e outra
          const presentes = new Set(anterior.dados.map((chamado) => chamado.id));
          const novos = resposta.chamados.filter((chamado) => !presentes.has(chamado.id));
          return { ...anterior, dados: [...anterior.dados, ...novos], temMais: resposta.temMais, carregandoMais: false };
        });
      })
      .catch(() => {
        if (minhaVersao === versao.current) setEstado((anterior) => ({ ...anterior, carregandoMais: false }));
      })
      .finally(() => {
        if (minhaVersao === versao.current) carregandoMais.current = false;
      });
  }, [buscar]);

  return { ...estado, recarregar, carregarMais };
}