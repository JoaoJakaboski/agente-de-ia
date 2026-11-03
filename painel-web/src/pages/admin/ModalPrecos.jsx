import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useRecurso } from "../../lib/useRecurso";
import Modal from "../../components/Modal";
import Botao from "../../components/Botao";
import Icone from "../../components/Icone";
import { Esqueleto } from "../../components/Estados";

function numeroOuNada(texto) {
  const valor = Number(String(texto).replace(",", "."));
  return String(texto).trim() !== "" && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

export default function ModalPrecos({ modelosUsados, aoFechar }) {
  const recurso = useRecurso(() => api("/admin/indicadores/precos").then((dados) => dados.precos), []);
  const [valores, setValores] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (recurso.status !== "ok" || valores) return;
    const mapa = {};
    for (const modelo of modelosUsados) mapa[modelo] = { entrada: "", saida: "" };
    for (const preco of recurso.dados) {
      mapa[preco.modelo] = { entrada: String(preco.preco_entrada_mtok), saida: String(preco.preco_saida_mtok) };
    }
    setValores(mapa);
  }, [recurso.status, recurso.dados, modelosUsados, valores]);

  function mudar(modelo, campo, texto) {
    setValores((atuais) => ({ ...atuais, [modelo]: { ...atuais[modelo], [campo]: texto } }));
  }

  async function salvar() {
    const precos = [];
    for (const [modelo, { entrada, saida }] of Object.entries(valores)) {
      if (entrada.trim() === "" && saida.trim() === "") continue;
      const e = numeroOuNada(entrada);
      const s = numeroOuNada(saida);
      if (e === null || s === null) {
        setErro(`Preencha os dois preços de ${modelo} com números (use ponto ou vírgula).`);
        return;
      }
      precos.push({ modelo, entrada: e, saida: s });
    }

    setSalvando(true);
    setErro(null);
    try {
      await api("/admin/indicadores/precos", { metodo: "PUT", corpo: { precos } });
      aoFechar(true);
    } catch {
      setErro("Não foi possível salvar os preços. Tente de novo.");
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Preços dos modelos"
      aoFechar={() => aoFechar(false)}
      rodape={
        <>
          <Botao onClick={() => aoFechar(false)}>Cancelar</Botao>
          <Botao variante="primario" disabled={!valores || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar preços"}
          </Botao>
        </>
      }
    >
      <p className="pa-campo__ajuda">
        Em dólares por milhão de tokens, como na tabela de preços da Anthropic. O custo do painel usa o preço atual
        para todo o histórico.
      </p>

      {!valores ? (
        <Esqueleto linhas={2} />
      ) : Object.keys(valores).length === 0 ? (
        <p className="vg-vazio">Nenhum modelo usado ainda.</p>
      ) : (
        <table className="pa-table vg-precos">
          <thead>
            <tr><th>Modelo</th><th>Entrada (US$/MTok)</th><th>Saída (US$/MTok)</th></tr>
          </thead>
          <tbody>
            {Object.entries(valores).map(([modelo, { entrada, saida }]) => (
              <tr key={modelo}>
                <td className="pa-mono">{modelo}</td>
                <td><input className="pa-input" inputMode="decimal" aria-label={`Preço de entrada de ${modelo}`}
                  value={entrada} onChange={(e) => mudar(modelo, "entrada", e.target.value)} /></td>
                <td><input className="pa-input" inputMode="decimal" aria-label={`Preço de saída de ${modelo}`}
                  value={saida} onChange={(e) => mudar(modelo, "saida", e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {erro && (
        <p className="pa-alert pa-alert--error" role="alert">
          <Icone nome="alerta" />
          {erro}
        </p>
      )}
    </Modal>
  );
}