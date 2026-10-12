import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { aplicarTema, lerPreferenciaTema } from "./lib/tema";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/componentes.css";
import App from "./App";

aplicarTema(lerPreferenciaTema());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);