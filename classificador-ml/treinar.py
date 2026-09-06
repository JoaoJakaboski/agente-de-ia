"""Treina o classificador de intenções de uma empresa: compara SVM e Naive
Bayes por validação cruzada e salva o melhor modelo.

Uso: python treinar.py <slug-da-empresa>
Espera encontrar dataset/<slug>/mensagens_treino.csv
"""

import sys
import os
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import SVC
from sklearn.metrics import classification_report
import pandas as pd


def treinar(slug):
    caminho_dataset = f"dataset/{slug}/mensagens_treino.csv"
    pasta_modelo = f"modelo/{slug}"

    if not os.path.exists(caminho_dataset):
        print(f"dataset não encontrado: {caminho_dataset}")
        sys.exit(1)

    df = pd.read_csv(caminho_dataset)
    X, y = df["texto"], df["intencao"]

    X_treino, X_teste, y_treino, y_teste = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    vetorizador = TfidfVectorizer()
    X_treino_vec = vetorizador.fit_transform(X_treino)
    X_teste_vec = vetorizador.transform(X_teste)

    candidatos = {
        "svm": SVC(kernel="linear", probability=True, random_state=42),
        "naive_bayes": MultinomialNB(),
    }

    melhor_nome = None
    melhor_modelo = None
    melhor_score = -1

    for nome, modelo in candidatos.items():
        scores = cross_val_score(modelo, X_treino_vec, y_treino, cv=3, scoring="f1_macro")
        media = scores.mean()
        print(f"{nome}: f1_macro médio (cv=3) = {media:.3f}")

        if media > melhor_score:
            melhor_score = media
            melhor_nome = nome
            melhor_modelo = modelo

    print(f"\nModelo escolhido: {melhor_nome}")

    melhor_modelo.fit(X_treino_vec, y_treino)
    y_pred = melhor_modelo.predict(X_teste_vec)

    print("\nDesempenho no conjunto de teste:")
    print(classification_report(y_teste, y_pred, zero_division=0))

    os.makedirs(pasta_modelo, exist_ok=True)
    joblib.dump(melhor_modelo, f"{pasta_modelo}/classificador.joblib")
    joblib.dump(vetorizador, f"{pasta_modelo}/vetorizador.joblib")
    print(f"\nModelo salvo em {pasta_modelo}/")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("uso: python treinar.py <slug-da-empresa>")
        sys.exit(1)
    treinar(sys.argv[1])
