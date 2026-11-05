"""Compara duas avaliações do classificador (ex.: antes e depois de mexer no dataset).

Uso: python comparar.py <slug> <rotulo-antes> <rotulo-depois>
Lê avaliacao/<slug>/<rotulo>/ gravadas pelo treinar.py e grava em
avaliacao/<slug>/comparacao_<antes>_x_<depois>/ a tabela e o gráfico.
"""

import json
import os
import sys

import pandas as pd

import graficos_avaliacao as graficos

LINHAS_RESUMO = ("accuracy", "macro avg", "weighted avg")


def carregar(slug, rotulo):
    pasta = f"avaliacao/{slug}/{rotulo}"
    if not os.path.exists(f"{pasta}/resumo.json"):
        print(f"avaliação não encontrada: {pasta} (rode antes: python treinar.py {slug} --rotulo {rotulo})")
        sys.exit(1)
    with open(f"{pasta}/resumo.json", encoding="utf-8") as arquivo:
        resumo = json.load(arquivo)
    metricas = pd.read_csv(f"{pasta}/metricas_por_intencao.csv", index_col=0, encoding="utf-8-sig")
    metricas = metricas[~metricas.index.isin(LINHAS_RESUMO)]
    return resumo, metricas


def numero(valor, formato="{:.3f}"):
    return "—" if valor is None else formato.format(valor)


def main(slug, antes, depois):
    resumo_a, metricas_a = carregar(slug, antes)
    resumo_d, metricas_d = carregar(slug, depois)
    pasta = f"avaliacao/{slug}/comparacao_{antes}_x_{depois}"
    os.makedirs(pasta, exist_ok=True)

    if resumo_a["dataset"]["hash"] == resumo_d["dataset"]["hash"]:
        print("(atenção: as duas avaliações usaram exatamente o mesmo dataset)")

    if resumo_a["limiar"] != resumo_d["limiar"]:
        print(f"(atenção: limiares diferentes, {resumo_a['limiar']} no '{antes}' e {resumo_d['limiar']} no '{depois}'; "
              f"rode os dois com o mesmo --limiar para comparar a cobertura)")

    # visão geral
    cv_a = resumo_a["validacao_cruzada"][resumo_a["modelo_escolhido"]]
    cv_d = resumo_d["validacao_cruzada"][resumo_d["modelo_escolhido"]]
    teste_a, teste_d = resumo_a.get("teste_fixo") or {}, resumo_d.get("teste_fixo") or {}
    geral = pd.DataFrame([
        ("Frases no dataset", resumo_a["dataset"]["frases"], resumo_d["dataset"]["frases"]),
        ("Intenções", resumo_a["dataset"]["intencoes"], resumo_d["dataset"]["intencoes"]),
        ("F1 macro (validação cruzada)", cv_a["f1_macro"], cv_d["f1_macro"]),
        ("Acurácia (validação cruzada)", cv_a["acuracia"], cv_d["acuracia"]),
        (f"Respondidas pela camada 1 no limiar {resumo_d['limiar']}", resumo_a["cobertura_no_limiar"], resumo_d["cobertura_no_limiar"]),
        ("Acerto nas respondidas", resumo_a["acerto_no_limiar"], resumo_d["acerto_no_limiar"]),
        ("F1 macro (teste fixo)", teste_a.get("f1_macro"), teste_d.get("f1_macro")),
        ("Acurácia (teste fixo)", teste_a.get("acuracia"), teste_d.get("acuracia")),
    ], columns=["indicador", antes, depois])
    geral.to_csv(f"{pasta}/visao_geral.csv", index=False, encoding="utf-8-sig")

    # por intenção
    por_intencao = pd.DataFrame({
        "intencao": sorted(set(metricas_a.index) | set(metricas_d.index)),
    })
    por_intencao["frases_antes"] = por_intencao["intencao"].map(metricas_a["support"]).fillna(0).astype(int)
    por_intencao["frases_depois"] = por_intencao["intencao"].map(metricas_d["support"]).fillna(0).astype(int)
    por_intencao["f1_antes"] = por_intencao["intencao"].map(metricas_a["f1-score"])
    por_intencao["f1_depois"] = por_intencao["intencao"].map(metricas_d["f1-score"])
    por_intencao["diferenca"] = (por_intencao["f1_depois"] - por_intencao["f1_antes"]).round(3)
    por_intencao.to_csv(f"{pasta}/por_intencao.csv", index=False, encoding="utf-8-sig")

    nas_duas = por_intencao.dropna(subset=["f1_antes", "f1_depois"])
    graficos.comparacao_f1(nas_duas, antes, depois, f"{pasta}/f1_por_intencao")

    print(f"\n{'':44s}{antes:>12s}{depois:>12s}")
    for _, linha in geral.iterrows():
        inteiro = linha["indicador"] in ("Frases no dataset", "Intenções")
        formato = "{:.0f}" if inteiro else "{:.3f}"
        print(f"{linha['indicador']:44s}{numero(linha[antes], formato):>12s}{numero(linha[depois], formato):>12s}")

    print("\nMaiores mudanças de F1 por intenção:")
    for _, linha in nas_duas.reindex(nas_duas["diferenca"].abs().sort_values(ascending=False).index).head(8).iterrows():
        print(f"  {linha['intencao']:24s} {linha['f1_antes']:.2f} -> {linha['f1_depois']:.2f}  ({linha['diferenca']:+.2f})"
              f"   frases {linha['frases_antes']} -> {linha['frases_depois']}")

    so_numa = por_intencao[por_intencao[["f1_antes", "f1_depois"]].isna().any(axis=1)]
    if len(so_numa):
        print(f"\nIntenções presentes só em uma das versões: {', '.join(so_numa['intencao'])}")

    print(f"\nComparação gravada em {pasta}/")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("uso: python comparar.py <slug> <rotulo-antes> <rotulo-depois>")
        sys.exit(1)
    main(*sys.argv[1:])
