from flask import Flask, request, jsonify
import joblib
import os

app = Flask(__name__)

# cache em memória: slug -> (modelo, vetorizador)
modelos_carregados = {}


def carregar_modelo(slug):
    if slug in modelos_carregados:
        return modelos_carregados[slug]

    pasta = f"modelo/{slug}"
    caminho_modelo = f"{pasta}/classificador.joblib"
    caminho_vetorizador = f"{pasta}/vetorizador.joblib"

    if not os.path.exists(caminho_modelo):
        return None

    modelo = joblib.load(caminho_modelo)
    vetorizador = joblib.load(caminho_vetorizador)
    modelos_carregados[slug] = (modelo, vetorizador)
    return modelos_carregados[slug]


@app.route("/classificar", methods=["POST"])
def classificar():
    body = request.get_json(silent=True) or {}
    empresa = body.get("empresa", "").strip()
    texto = body.get("texto", "").strip()

    if not empresa or not texto:
        return jsonify({"erro": "campos 'empresa' e 'texto' são obrigatórios"}), 400

    par = carregar_modelo(empresa)
    if par is None:
        return jsonify({"erro": f"nenhum modelo treinado para a empresa '{empresa}'"}), 404

    modelo, vetorizador = par
    vetor = vetorizador.transform([texto])
    intencao = modelo.predict(vetor)[0]
    probabilidades = modelo.predict_proba(vetor)[0]
    confianca = float(max(probabilidades))

    return jsonify({"intencao": intencao, "confianca": confianca})


@app.route("/saude", methods=["GET"])
def saude():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=porta)
