import { NavLink, useNavigate } from "react-router-dom";
import { useSessao } from "../lib/sessao";
import { useTempoReal } from "../lib/tempoReal";
import { Menu, ItemMenu, SeparadorMenu } from "./Menu";
import { OpcoesTema } from "./MenuTema";
import IndicadorConexao from "./IndicadorConexao";
import Marca from "./Marca";
import Icone from "./Icone";
import "./BarraSuperior.css";

const PAPEIS = { admin: "Administrador", atendente: "Atendente" };

export default function BarraSuperior() {
  const { usuario, sair } = useSessao();
  const { contagens } = useTempoReal();
  const navegar = useNavigate();
  const aguardando = contagens ? contagens.aguardando : 0;

  async function aoSair() {
    await sair();
    navegar("/login", { replace: true });
  }

  return (
    <header className="barra">
      <Marca texto={usuario.empresaNome} />

      <nav className="barra__nav" aria-label="Principal">
        <NavLink to="/atendimentos" className="barra__link">
          <Icone nome="conversa" />
          Atendimentos
          {aguardando > 0 && (
            <span className="pa-count pa-count--alerta" aria-label={`${aguardando} aguardando atendente`}>
              {aguardando}
            </span>
          )}
        </NavLink>
        <NavLink to="/clientes" className="barra__link">
          <Icone nome="pessoa" />
          Clientes
        </NavLink>
        {usuario.papel === "admin" && (
          <>
            <NavLink to="/regras" className="barra__link">
              <Icone nome="lista" />
              Regras de FAQ
            </NavLink>
            <NavLink to="/agente" className="barra__link">
              <Icone nome="engrenagem" />
              Agente
            </NavLink>
          </>
        )}
      </nav>

      <div className="barra__direita">
        <IndicadorConexao />
        <Menu
          classeBotao="barra__usuario"
          conteudoBotao={
            <>
              <span className="barra__usuario-textos">
                <span className="barra__usuario-nome">{usuario.nome}</span>
                <span className="barra__usuario-papel">{PAPEIS[usuario.papel]}</span>
              </span>
              <Icone nome="setaBaixo" />
            </>
          }
        >
          <OpcoesTema />
          <SeparadorMenu />
          <ItemMenu icone={<Icone nome="sair" />} perigo onSelect={aoSair}>Sair</ItemMenu>
        </Menu>
      </div>
    </header>
  );
}