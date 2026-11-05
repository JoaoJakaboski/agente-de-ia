"""Treina o classificador de intenções de uma empresa.

1. Compara SVM e Naive Bayes por validação cruzada estratificada (5 partes).
2. Gera o relatório de avaliação do modelo escolhido: métricas por intenção,
   matriz de confusão e cobertura x acerto por limiar de confiança.
3. Treina o modelo escolhido com todas as frases e salva para o servidor.

Uso: python treinar.py <slug-da-empresa> [--rotulo antes] [--limiar 0.7]
Espera encontrar dataset/<slug>/mensagens_treino.csv
Opcional: dataset/<slug>/teste_fixo.csv (mesmo formato), com frases que NUNCA
entram no treino; serve para comparar versões do dataset com a mesma régua.

Grava o modelo em modelo/<slug>/ e a avaliação em avaliacao/<slug>/<rotulo>/
(sem --rotulo, o rótulo é a data e a hora da execução).
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC

import graficos_avaliacao as graficos

PARTES = 5
SEMENTE = 42
LIMIARES = [0.5, 0.6, 0.7, 0.8, 0.9]


def candidatos():
    # o vetorizador fica dentro do pipeline: em cada parte da validação ele só
    # aprende o vocabulário das frases de treino, sem espiar as de teste
    return {
        "svm": Pipeline([
            ("tfidf", TfidfVectorizer()),
            ("modelo", SVC(kernel="linear", probability=True, random_state=SEMENTE)),
        ]),
        "naive_bayes": Pipeline([
            ("tfidf", TfidfVectorizer()),
            ("modelo", MultinomialNB()),
        ]),
    }


def dividir():
    # mesma divisão para todos os modelos (e para o baseline de palavras-chave)
    return StratifiedKFold(n_splits=PARTES, shuffle=True, random_state=SEMENTE)


def cobertura_por_limiar(y, probabilidades, classes):
    """Para cada limiar: quantas frases a camada 1 responderia sozinha e com que acerto."""
    previstas = classes[probabilidades.argmax(axis=1)]
    confiancas = probabilidades.max(axis=1)
    linhas = []
    for limiar in LIMIARES:
        respondidas = confiancas >= limiar
        total = int(respondidas.sum())
        acerto = accuracy_score(y[respondidas], previstas[respondidas]) if total else float("nan")
        linhas.append({
            "limiar": limiar,
            "frases_respondidas": total,
            "cobertura": total / len(y),
            "acerto_nas_respondidas": acerto,
        })
    return pd.DataFrame(linhas)


def salvar_matriz(y, previstas, classes, pasta):
    matriz = confusion_matrix(y, previstas, labels=classes)
    pd.DataFrame(matriz, index=classes, columns=classes).to_csv(f"{pasta}/matriz_confusao.csv", encoding="utf-8-sig")
    graficos.matriz_confusao(matriz, classes, f"{pasta}/matriz_confusao")


def ler_dataset(caminho):
    # utf-8-sig: o CSV salvo pelo Excel começa com BOM
    df = pd.read_csv(caminho, encoding="utf-8-sig")
    df["texto"] = df["texto"].astype(str).str.strip()
    df["intencao"] = df["intencao"].astype(str).str.strip()
    return df


def avaliar_teste_fixo(modelo, df_teste, frases_treino, limiar):
    """Avalia o modelo final em frases que ele nunca viu; ignora as que também estão no treino."""
    repetidas = df_teste["texto"].str.lower().isin(frases_treino)
    if repetidas.any():
        print(f"(teste fixo: {int(repetidas.sum())} frases também estão no treino e foram ignoradas)")
    df_teste = df_teste[~repetidas]
    if df_teste.empty:
        return None

    y = df_teste["intencao"].to_numpy()
    probabilidades = modelo.predict_proba(df_teste["texto"].to_numpy())
    classes = modelo.classes_
    previstas = classes[probabilidades.argmax(axis=1)]
    respondidas = probabilidades.max(axis=1) >= limiar
    return {
        "frases": int(len(y)),
        "acuracia": float(accuracy_score(y, previstas)),
        "f1_macro": float(f1_score(y, previstas, average="macro", zero_division=0)),
        "cobertura_no_limiar": float(respondidas.mean()),
        "acerto_no_limiar": float(accuracy_score(y[respondidas], previstas[respondidas])) if respondidas.any() else None,
    }


def treinar(slug, rotulo, limiar):
    caminho_dataset = f"dataset/{slug}/mensagens_treino.csv"
    caminho_teste_fixo = f"dataset/{slug}/teste_fixo.csv"
    pasta_modelo = f"modelo/{slug}"
    pasta_avaliacao = f"avaliacao/{slug}/{rotulo}"

    if not os.path.exists(caminho_dataset):
        print(f"dataset não encontrado: {caminho_dataset}")
        sys.exit(1)

    df = ler_dataset(caminho_dataset)
    X = df["texto"].to_numpy()
    y = df["intencao"].to_numpy()
    classes = np.array(sorted(set(y)))

    menor = pd.Series(y).value_counts().min()
    if menor < PARTES:
        print(f"cada intenção precisa de pelo menos {PARTES} frases (a menor tem {menor})")
        sys.exit(1)

    print(f"{len(y)} frases, {len(classes)} intenções, validação cruzada estratificada com {PARTES} partes\n")

    # 1. comparação dos candidatos, na mesma divisão
    resultados = {}
    for nome, pipeline in candidatos().items():
        previstas = cross_val_predict(pipeline, X, y, cv=dividir())
        por_parte = [
            f1_score(y[teste], previstas[teste], average="macro", zero_division=0)
            for _, teste in dividir().split(X, y)
        ]
        resultados[nome] = {
            "previstas": previstas,
            "f1_macro": float(np.mean(por_parte)),
            "f1_desvio": float(np.std(por_parte)),
            "acuracia": accuracy_score(y, previstas),
        }
        print(f"{nome:12s} f1_macro = {resultados[nome]['f1_macro']:.3f} ± {resultados[nome]['f1_desvio']:.3f}"
              f"   acurácia = {resultados[nome]['acuracia']:.3f}")

    melhor = max(resultados, key=lambda nome: resultados[nome]["f1_macro"])
    print(f"\nModelo escolhido: {melhor}")

    # 2. avaliação detalhada do escolhido
    os.makedirs(pasta_avaliacao, exist_ok=True)
    previstas = resultados[melhor]["previstas"]

    relatorio = classification_report(y, previstas, zero_division=0, output_dict=True)
    pd.DataFrame(relatorio).transpose().round(3).to_csv(f"{pasta_avaliacao}/metricas_por_intencao.csv", encoding="utf-8-sig")
    salvar_matriz(y, previstas, classes, pasta_avaliacao)

    probabilidades = cross_val_predict(candidatos()[melhor], X, y, cv=dividir(), method="predict_proba")
    limiares = cobertura_por_limiar(y, probabilidades, classes)
    limiares.round(3).to_csv(f"{pasta_avaliacao}/cobertura_por_limiar.csv", index=False, encoding="utf-8-sig")
    graficos.cobertura_por_limiar(limiares, limiar, f"{pasta_avaliacao}/cobertura_por_limiar")

    pd.DataFrame([
        {"modelo": nome, "f1_macro": r["f1_macro"], "f1_desvio": r["f1_desvio"], "acuracia": r["acuracia"]}
        for nome, r in resultados.items()
    ]).round(3).to_csv(f"{pasta_avaliacao}/comparacao_modelos.csv", index=False, encoding="utf-8-sig")

    # frases que o modelo errou: material para melhorar o dataset
    erros = df.assign(prevista=previstas)[previstas != y]
    erros.to_csv(f"{pasta_avaliacao}/erros.csv", index=False, encoding="utf-8-sig")

    print("\nDesempenho por intenção (validação cruzada):")
    print(classification_report(y, previstas, zero_division=0))
    print("Cobertura da camada 1 por limiar de confiança:")
    print(limiares.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(f"\n{len(erros)} frases erradas listadas em {pasta_avaliacao}/erros.csv")

    # 3. modelo final: treinado com todas as frases
    final = candidatos()[melhor].fit(X, y)
    os.makedirs(pasta_modelo, exist_ok=True)
    joblib.dump(final.named_steps["modelo"], f"{pasta_modelo}/classificador.joblib")
    joblib.dump(final.named_steps["tfidf"], f"{pasta_modelo}/vetorizador.joblib")

    teste_fixo = None
    if os.path.exists(caminho_teste_fixo):
        teste_fixo = avaliar_teste_fixo(final, ler_dataset(caminho_teste_fixo), set(df["texto"].str.lower()), limiar)
        if teste_fixo:
            print(f"\nTeste fixo ({teste_fixo['frases']} frases nunca vistas): f1_macro = {teste_fixo['f1_macro']:.3f}"
                  f"   acurácia = {teste_fixo['acuracia']:.3f}"
                  f"   respondidas no limiar {limiar} = {teste_fixo['cobertura_no_limiar']:.1%}")

    # resumo da execução: é o que o comparar.py lê
    with open(caminho_dataset, "rb") as arquivo:
        hash_dataset = hashlib.sha256(arquivo.read()).hexdigest()[:12]
    linha_limiar = limiares[np.isclose(limiares["limiar"], limiar)]
    resumo = {
        "rotulo": rotulo,
        "executado_em": datetime.now().isoformat(timespec="seconds"),
        "dataset": {"frases": int(len(y)), "intencoes": int(len(classes)), "hash": hash_dataset},
        "modelo_escolhido": melhor,
        "validacao_cruzada": {
            nome: {"f1_macro": r["f1_macro"], "f1_desvio": r["f1_desvio"], "acuracia": r["acuracia"]}
            for nome, r in resultados.items()
        },
        "limiar": limiar,
        "cobertura_no_limiar": float(linha_limiar["cobertura"].iloc[0]) if len(linha_limiar) else None,
        "acerto_no_limiar": float(linha_limiar["acerto_nas_respondidas"].iloc[0]) if len(linha_limiar) else None,
        "teste_fixo": teste_fixo,
    }
    with open(f"{pasta_avaliacao}/resumo.json", "w", encoding="utf-8") as arquivo:
        json.dump(resumo, arquivo, ensure_ascii=False, indent=2)

    print(f"\nModelo salvo em {pasta_modelo}/ e avaliação em {pasta_avaliacao}/")


if __name__ == "__main__":
    argumentos = argparse.ArgumentParser(description="Treina e avalia o classificador de intenções de uma empresa.")
    argumentos.add_argument("slug", help="slug da empresa (pasta em dataset/)")
    argumentos.add_argument("--rotulo", help="nome desta avaliação, ex.: antes, depois (padrão: data e hora)")
    argumentos.add_argument("--limiar", type=float, default=0.7, help="limiar de confiança usado no bot (padrão: 0.7)")
    opcoes = argumentos.parse_args()

    rotulo = opcoes.rotulo or datetime.now().strftime("%Y-%m-%d_%H%M")
    if not all(c.isalnum() or c in "-_" for c in rotulo):
        print("o rótulo só pode ter letras, números, - e _")
        sys.exit(1)
    treinar(opcoes.slug, rotulo, opcoes.limiar)
