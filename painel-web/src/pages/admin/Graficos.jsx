import { rotuloDiaCurto } from "./indicadores";

export function Cartao({ rotulo, valor, detalhe }) {
  return (
    <div className="vg-cartao">
      <div className="vg-cartao__rotulo">{rotulo}</div>
      <div className="vg-cartao__valor">{valor}</div>
      {detalhe && <div className="vg-cartao__detalhe">{detalhe}</div>}
    </div>
  );
}

// colunas por dia; o valor de cada dia aparece ao passar o mouse
export function BarrasPorDia({ dias, campo, formatar, descricao }) {
  const maximo = Math.max(0, ...dias.map((dia) => dia[campo]));
  if (maximo === 0) return <p className="vg-vazio">Sem dados no período.</p>;

  return (
    <div>
      <div className="vg-dias" role="img" aria-label={descricao}>
        {dias.map((dia) => (
          <div key={dia.dia} className="vg-dias__coluna" title={`${rotuloDiaCurto(dia.dia)}: ${formatar(dia[campo])}`}>
            <div className="vg-dias__barra" style={{ height: `${(dia[campo] / maximo) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="vg-dias__eixo">
        <span>{rotuloDiaCurto(dias[0].dia)}</span>
        <span>máx. {formatar(maximo)}</span>
        <span>{rotuloDiaCurto(dias[dias.length - 1].dia)}</span>
      </div>
    </div>
  );
}

// ranking horizontal com o valor escrito ao lado
export function BarrasHorizontais({ itens, formatar = String, classeRotulo }) {
  if (!itens.length) return <p className="vg-vazio">Sem dados no período.</p>;
  const maximo = Math.max(...itens.map((item) => item.valor)) || 1;

  return (
    <ul className="vg-barras">
      {itens.map((item) => (
        <li key={item.chave}>
          <span className={`vg-barras__rotulo ${classeRotulo || ""}`} title={item.rotulo}>{item.rotulo}</span>
          <span className="vg-barras__trilho">
            <span className="vg-barras__barra" style={{ width: `${(item.valor / maximo) * 100}%` }} />
          </span>
          <span className="vg-barras__valor">{formatar(item.valor)}</span>
        </li>
      ))}
    </ul>
  );
}