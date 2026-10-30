import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { SessaoProvider, useSessao } from "./lib/sessao";
import { TemaProvider } from "./lib/tema";
import { TempoRealProvider } from "./lib/tempoReal";
import BarraSuperior from "./components/BarraSuperior";
import Login from "./pages/Login";
import Atendimentos from "./pages/atendimentos/Atendimentos";
import RegrasFaq from "./pages/admin/RegrasFaq";
import Agente from "./pages/admin/Agente";
import Clientes from "./pages/clientes/Clientes";
import EsqueciSenha from "./pages/EsqueciSenha";
import DefinirSenha from "./pages/DefinirSenha";

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

function SomenteAdmin() {
  const { usuario } = useSessao();
  return usuario.papel === "admin" ? <Outlet /> : <Navigate to="/atendimentos" replace />;
}

export default function App() {
  return (
    <TemaProvider>
      <SessaoProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />            
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/definir-senha" element={<DefinirSenha />} />
            <Route element={<LayoutPainel />}>
              <Route path="/" element={<Navigate to="/atendimentos" replace />} />
              <Route path="/atendimentos/:chamadoId?" element={<Atendimentos />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route element={<SomenteAdmin />}>
                <Route path="/regras" element={<RegrasFaq />} />
                <Route path="/agente" element={<Agente />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SessaoProvider>
    </TemaProvider>
  );
}