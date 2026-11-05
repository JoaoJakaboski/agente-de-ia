"""Baseline de palavras-chave: compara o classificador com uma regra simples.

Cada intenção tem uma lista de termos em dataset/<slug>/palavras_chave.json.
Uma frase recebe, para cada intenção, a soma dos termos encontrados nela
(um termo de várias palavras pesa mais: "quanto custa" vale 2, "pix" vale 1).
Ganha a intenção com a maior pontuação; sem nenhum termo, a frase fica sem
resposta (no bot, iria para a camada 2).

Uso: python palavras_chave.py <slug> --rotulo <rotulo>
O rótulo é o de uma avaliação já gerada pelo treinar.py: o baseline é medido
nas mesmas frases e lado a lado com o SVM dessa avaliação. Grava em
avaliacao/<slug>/<rotulo>/palavras_chave/.
"""

import argparse
import json
import os
import re
import sys
import unicodedata

import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score

import graficos_avaliacao as graficos

SEM_RESPOSTA = "(sem resposta)"


def normalizar(texto):
    """Minúsculas, sem acento e sem pontuação: "Orçamento?" vira "orcamento"."""
    texto = unicodedata.normalize("NFD", str(texto).lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", texto).split())


def carregar_termos(caminho):
    with open(caminho, encoding="utf-8") as arquivo:
        bruto = json.load(arquivo)
    # chaves que começam com "_" são comentários do arquivo
    return {intencao: [normalizar(t) for t in termos] for intencao, termos in bruto.items() if not intencao.startswith("_")}


def classificar(texto, termos):
    alvo = f" {normalizar(texto)} "
    pontos = {}
    for intencao, lista in termos.items():
        total = sum(len(termo.split()) for termo in lista if f" {termo} " in alvo)
        if total:
            pontos[intencao] = total
    if not pontos:
        return SEM_RESPOSTA
    # empate: vence a intenção que aparece primeiro no arquivo (a ordem do JSON é a prioridade)
    return max(pontos, key=pontos.get)


def avaliar(y, previstas):
    respondidas = previstas != SEM_RESPOSTA
    return {
        "frases": int(len(y)),
        "f1_macro": float(f1_score(y, previstas, labels=sorted(set(y)), average="macro", zero_division=0)),
        "acuracia": float(accuracy_score(y, previstas)),
        "cobertura": float(respondidas.mean()),
        "acerto_nas_respondidas": float(accuracy_score(y[respondidas], previstas[respondidas])) if respondidas.any() else None,
    }


def conferir_termos(termos, df):
    """Avisa sobre termos que não aparecem em nenhuma frase de treino da própria intenção."""
    avisos = []
    for intencao, lista in termos.items():
        frases = [f" {normalizar(t)} " for t in df.loc[df["intencao"] == intencao, "texto"]]
        if not frases:
            avisos.append(f"intenção '{intencao}' não existe no dataset")
            continue
        soltos = [termo for termo in lista if not any(f" {termo} " in frase for frase in frases)]
        if soltos:
            avisos.append(f"{intencao}: {', '.join(soltos)}")
    if avisos:
        print("Termos que não aparecem nas frases de treino da própria intenção (revise para não usar informação do teste):")
        for aviso in avisos:
            print(f"  {aviso}")
        print()


def ler_csv(caminho):
    df = pd.read_csv(caminho, encoding="utf-8-sig")
    df["texto"] = df["texto"].astype(str).str.strip()
    df["intencao"] = df["intencao"].astype(str).str.strip()
    return df


def porcento(valor):
    return "—" if valor is None else f"{valor:.1%}"


def decimal(valor):
    return "—" if valor is None else f"{valor:.3f}"


def main(slug, rotulo):
    pasta_avaliacao = f"avaliacao/{slug}/{rotulo}"
    caminho_termos = f"dataset/{slug}/palavras_chave.json"
    caminho_teste_fixo = f"dataset/{slug}/teste_fixo.csv"

    for caminho, dica in [
        (f"{pasta_avaliacao}/resumo.json", f"rode antes: python treinar.py {slug} --rotulo {rotulo}"),
        (caminho_termos, "crie a lista de termos por intenção"),
    ]:
        if not os.path.exists(caminho):
            print(f"não encontrado: {caminho} ({dica})")
            sys.exit(1)

    with open(f"{pasta_avaliacao}/resumo.json", encoding="utf-8") as arquivo:
        resumo = json.load(arquivo)
    termos = carregar_termos(caminho_termos)
    df = ler_csv(f"dataset/{slug}/mensagens_treino.csv")
    conferir_termos(termos, df)

    pasta = f"{pasta_avaliacao}/palavras_chave"
    os.makedirs(pasta, exist_ok=True)

    # 1. as mesmas frases avaliadas na validação cruzada do SVM.
    #    As palavras-chave não aprendem nada, então avaliar todas as frases equivale
    #    a juntar as 5 partes de teste da validação cruzada
    y = df["intencao"].to_numpy()
    previstas = df["texto"].map(lambda texto: classificar(texto, termos)).to_numpy()
    no_dataset = avaliar(y, previstas)

    relatorio = classification_report(y, previstas, labels=sorted(set(y)), zero_division=0, output_dict=True)
    pd.DataFrame(relatorio).transpose().round(3).to_csv(f"{pasta}/metricas_por_intencao.csv", encoding="utf-8-sig")
    df.assign(prevista=previstas)[previstas != y].to_csv(f"{pasta}/erros.csv", index=False, encoding="utf-8-sig")

    # 2. teste fixo, se existir
    no_teste_fixo = None
    if os.path.exists(caminho_teste_fixo):
        teste = ler_csv(caminho_teste_fixo)
        teste = teste[~teste["texto"].str.lower().isin(set(df["texto"].str.lower()))]
        if not teste.empty:
            y_teste = teste["intencao"].to_numpy()
            no_teste_fixo = avaliar(y_teste, teste["texto"].map(lambda texto: classificar(texto, termos)).to_numpy())

    # 3. lado a lado com o SVM da mesma avaliação
    svm = resumo["validacao_cruzada"][resumo["modelo_escolhido"]]
    teste_svm = resumo.get("teste_fixo") or {}
    limiar = resumo["limiar"]
    comparacao = pd.DataFrame([
        ("F1 macro (dataset)", no_dataset["f1_macro"], svm["f1_macro"]),
        ("Acurácia (dataset)", no_dataset["acuracia"], svm["acuracia"]),
        ("Frases respondidas (dataset)", no_dataset["cobertura"], resumo["cobertura_no_limiar"]),
        ("Acerto nas respondidas (dataset)", no_dataset["acerto_nas_respondidas"], resumo["acerto_no_limiar"]),
        ("F1 macro (teste fixo)", no_teste_fixo and no_teste_fixo["f1_macro"], teste_svm.get("f1_macro")),
        ("Acurácia (teste fixo)", no_teste_fixo and no_teste_fixo["acuracia"], teste_svm.get("acuracia")),
        ("Frases respondidas (teste fixo)", no_teste_fixo and no_teste_fixo["cobertura"], teste_svm.get("cobertura_no_limiar")),
        ("Acerto nas respondidas (teste fixo)", no_teste_fixo and no_teste_fixo["acerto_nas_respondidas"], teste_svm.get("acerto_no_limiar")),
    ], columns=["indicador", "palavras_chave", resumo["modelo_escolhido"]])
    comparacao.to_csv(f"{pasta}/comparacao_com_svm.csv", index=False, encoding="utf-8-sig")

    # F1 por intenção: palavras-chave x SVM
    metricas_svm = pd.read_csv(f"{pasta_avaliacao}/metricas_por_intencao.csv", index_col=0, encoding="utf-8-sig")
    intencoes = sorted(set(y))
    por_intencao = pd.DataFrame({
        "intencao": intencoes,
        "f1_antes": [relatorio[i]["f1-score"] for i in intencoes],
        "f1_depois": [metricas_svm.loc[i, "f1-score"] if i in metricas_svm.index else None for i in intencoes],
    })
    por_intencao.rename(columns={"f1_antes": "f1_palavras_chave", "f1_depois": "f1_svm"}).round(3).to_csv(
        f"{pasta}/por_intencao.csv", index=False, encoding="utf-8-sig")
    graficos.comparacao_f1(por_intencao.dropna(), "palavras-chave", resumo["modelo_escolhido"].upper(), f"{pasta}/f1_por_intencao",
                          eixo_x="F1 por intenção (SVM: validação cruzada; palavras-chave: todas as frases)")

    with open(f"{pasta}/resumo.json", "w", encoding="utf-8") as arquivo:
        json.dump({"dataset": no_dataset, "teste_fixo": no_teste_fixo, "termos": sum(len(l) for l in termos.values())},
                  arquivo, ensure_ascii=False, indent=2)

    print(f"Palavras-chave x {resumo['modelo_escolhido'].upper()} (avaliação '{rotulo}'; SVM com limiar {limiar})\n")
    print(f"{'':40s}{'palavras-chave':>16s}{resumo['modelo_escolhido'].upper():>10s}")
    for _, linha in comparacao.iterrows():
        formato = porcento if "respondidas" in linha["indicador"].lower() or "Acerto" in linha["indicador"] else decimal
        print(f"{linha['indicador']:40s}{formato(linha['palavras_chave']):>16s}{formato(linha[resumo['modelo_escolhido']]):>10s}")
    print(f"\nComparação gravada em {pasta}/")


if __name__ == "__main__":
    argumentos = argparse.ArgumentParser(description="Avalia o baseline de palavras-chave ao lado do classificador.")
    argumentos.add_argument("slug", help="slug da empresa (pasta em dataset/)")
    argumentos.add_argument("--rotulo", required=True, help="avaliação do treinar.py a comparar (ex.: depois)")
    opcoes = argumentos.parse_args()
    main(opcoes.slug, opcoes.rotulo)
