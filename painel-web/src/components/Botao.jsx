export default function Botao({ variante = "secundario", tamanho, icone, children, type = "button", ...props }) {
  const classes = ["pa-btn", `pa-btn--${variante}`, tamanho === "lg" && "pa-btn--lg"].filter(Boolean).join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {icone}
      {children}
    </button>
  );
}