import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { SessaoProvider, useSessao } from "./lib/sessao";
import { TemaProvider } from "./lib/tema";
import { TempoRealProvider } from "./lib/tempoReal";
import BarraSuperior from "./components/BarraSuperior";
import Login from "./pages/Login";
import Atendimentos from "./pages/atendimentos/Atendimentos";

function LayoutPainel() {
  const { carregando, usuario } = useSessao();
  if (carregando) return null;
  if (!usuario) return <Navigate to="/login" replace />;

  return (
    <TempoRealProvider>
      <div className="painel">
        <BarraSuperior />
        <main className="painel__conteudo">
          <Outlet />
        </main>
      </div>
    </TempoRealProvider>
  );
}

export default function App() {
  return (
    <TemaProvider>
      <SessaoProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<LayoutPainel />}>
              <Route path="/" element={<Navigate to="/atendimentos" replace />} />
              <Route path="/atendimentos/:chamadoId?" element={<Atendimentos />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SessaoProvider>
    </TemaProvider>
  );
}