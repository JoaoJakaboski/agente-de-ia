import { useTempoReal } from "../lib/tempoReal";

export default function IndicadorConexao() {
  const { offlineDesde } = useTempoReal();

  if (offlineDesde) {
    return (
      <span className="pa-live pa-live--off" role="status">
        <span className="pa-live__dot" />
        Reconectando…
      </span>
    );
  }

  return (
    <span className="pa-live" role="status" title="Mensagens chegam em tempo real">
      <span className="pa-live__dot" />
      Online
    </span>
  );
}