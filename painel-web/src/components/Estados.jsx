import Icone from "./Icone";
import Botao from "./Botao";

export function EstadoVazio({ icone = "caixa", titulo, texto, acao }) {
  return (
    <div className="pa-state" role="status">
      <div className="pa-state__ico"><Icone nome={icone} /></div>
      <div className="pa-state__title">{titulo}</div>
      {texto && <div className="pa-state__txt">{texto}</div>}
      {acao}
    </div>
  );
}

export function EstadoErro({ titulo, texto, aoTentar }) {
  return (
    <div className="pa-state pa-state--error" role="alert">
      <div className="pa-state__ico"><Icone nome="alerta" /></div>
      <div className="pa-state__title">{titulo}</div>
      {texto && <div className="pa-state__txt">{texto}</div>}
      {aoTentar && (
        <Botao icone={<Icone nome="atualizar" />} onClick={aoTentar}>Tentar de novo</Botao>
      )}
    </div>
  );
}

export function Esqueleto({ linhas = 4 }) {
  return (
    <div className="pa-esqueleto" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice} className="pa-esqueleto__bloco">
          <div className="pa-skel" style={{ height: 12, width: "45%" }} />
          <div className="pa-skel" style={{ height: 10, width: "85%" }} />
        </div>
      ))}
    </div>
  );
}