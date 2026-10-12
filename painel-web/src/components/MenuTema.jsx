import { useTema } from "../lib/tema";
import { Menu, GrupoMenu, ItemMenuRadio } from "./Menu";
import Icone from "./Icone";

const OPCOES = [
  { valor: "sistema", rotulo: "Usar o do sistema", icone: "monitor" },
  { valor: "claro", rotulo: "Claro", icone: "sol" },
  { valor: "escuro", rotulo: "Escuro", icone: "lua" },
];

export function OpcoesTema() {
  const { preferencia, definirTema } = useTema();

  return (
    <GrupoMenu rotulo="Tema">
      {OPCOES.map((opcao) => (
        <ItemMenuRadio
          key={opcao.valor}
          icone={<Icone nome={opcao.icone} />}
          marcado={preferencia === opcao.valor}
          onSelect={() => definirTema(opcao.valor)}
        >
          {opcao.rotulo}
        </ItemMenuRadio>
      ))}
    </GrupoMenu>
  );
}

export function BotaoTema() {
  const { temaEfetivo } = useTema();

  return (
    <Menu
      rotuloBotao="Mudar tema"
      classeBotao="pa-btn pa-btn--icone"
      conteudoBotao={<Icone nome={temaEfetivo === "escuro" ? "lua" : "sol"} />}
    >
      <OpcoesTema />
    </Menu>
  );
}