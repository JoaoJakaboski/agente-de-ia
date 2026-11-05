"""Gráficos da avaliação do classificador (usados por treinar.py e comparar.py).

Precisa do matplotlib (requirements-treino.txt). Sem ele, as funções avisam e
não geram nada: os CSVs continuam sendo gravados pelos scripts.
"""

import numpy as np

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import colormaps
    from matplotlib.patches import Patch

    DISPONIVEL = True
except ImportError:
    DISPONIVEL = False

VERDE = "#0a6650"   # mesma cor primária do painel
AZUL = "#1f55b0"
CINZA = "#8a948f"
TINTA = "#1b1f1d"
TINTA_SUAVE = "#5d6662"


def _sem_matplotlib():
    if not DISPONIVEL:
        print("(matplotlib não instalado: gráficos não gerados; instale requirements-treino.txt)")
    return not DISPONIVEL


def _salvar(figura, caminho_sem_extensao):
    figura.savefig(f"{caminho_sem_extensao}.png", dpi=200, bbox_inches="tight")
    figura.savefig(f"{caminho_sem_extensao}.pdf", bbox_inches="tight")
    plt.close(figura)


def _eixos_limpos(eixo):
    for lado in ("top", "right"):
        eixo.spines[lado].set_visible(False)
    for lado in ("left", "bottom"):
        eixo.spines[lado].set_color(CINZA)
    eixo.tick_params(colors=TINTA_SUAVE)


def matriz_confusao(matriz, classes, caminho_sem_extensao):
    """Matriz com a diagonal subindo da esquerda para a direita ( / ).

    Cada célula é colorida pela fração das frases da intenção real (a linha):
    - diagonal (acertos) em verde: quanto mais perto de 100%, mais escuro;
    - fora da diagonal (confusões) em magenta, para não depender só da cor:
      a posição na diagonal já separa acerto de erro.
    """
    if _sem_matplotlib():
        return

    n = len(classes)
    totais = matriz.sum(axis=1, keepdims=True)
    fracoes = np.divide(matriz, totais, out=np.zeros(matriz.shape, dtype=float), where=totais > 0)

    verdes = colormaps["Greens"]
    magentas = colormaps["RdPu"]
    imagem = np.ones((n, n, 4))
    for i in range(n):
        for j in range(n):
            if matriz[i, j] == 0:
                continue
            if i == j:
                imagem[i, j] = verdes(0.15 + 0.85 * fracoes[i, j])
            else:
                # confusões raramente passam de metade da linha: a escala vai até 50%
                imagem[i, j] = magentas(0.2 + 0.7 * min(fracoes[i, j] / 0.5, 1))

    tamanho = max(8, n * 0.5)
    figura, eixo = plt.subplots(figsize=(tamanho, tamanho))
    # origin="lower": a primeira intenção fica embaixo, e a diagonal sobe ( / )
    eixo.imshow(imagem, origin="lower", interpolation="nearest")

    for i in range(n):
        for j in range(n):
            if matriz[i, j] == 0:
                continue
            escura = (i == j and fracoes[i, j] > 0.55) or (i != j and fracoes[i, j] > 0.3)
            texto = f"{fracoes[i, j]:.0%}" if i == j else str(matriz[i, j])
            eixo.text(j, i, texto, ha="center", va="center", fontsize=7,
                      color="white" if escura else TINTA)

    eixo.set_xticks(range(n), labels=classes, rotation=90, fontsize=8)
    eixo.set_yticks(range(n), labels=classes, fontsize=8)
    eixo.set_xlabel("Intenção prevista")
    eixo.set_ylabel("Intenção real")
    eixo.set_xticks(np.arange(-0.5, n), minor=True)
    eixo.set_yticks(np.arange(-0.5, n), minor=True)
    eixo.grid(which="minor", color="#e3e6e2", linewidth=0.6)
    eixo.tick_params(which="minor", length=0)

    eixo.legend(
        handles=[
            Patch(color=verdes(0.9), label="Acertos (% das frases da intenção)"),
            Patch(color=magentas(0.6), label="Confusões (nº de frases)"),
        ],
        loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=2, frameon=False, fontsize=8,
    )
    _salvar(figura, caminho_sem_extensao)


def cobertura_por_limiar(tabela, limiar_atual, caminho_sem_extensao):
    """Duas séries na mesma escala (%): quanto a camada 1 responde e quanto acerta."""
    if _sem_matplotlib():
        return

    figura, eixo = plt.subplots(figsize=(6.5, 4))
    x = tabela["limiar"].to_numpy()
    series = [
        ("Respondidas pela camada 1", tabela["cobertura"].to_numpy() * 100, AZUL),
        ("Acerto nas respondidas", tabela["acerto_nas_respondidas"].to_numpy() * 100, VERDE),
    ]
    for rotulo, valores, cor in series:
        eixo.plot(x, valores, color=cor, linewidth=2, marker="o", markersize=5, label=rotulo)
        eixo.annotate(f"{valores[-1]:.0f}%", (x[-1], valores[-1]), xytext=(6, 0),
                      textcoords="offset points", va="center", fontsize=8, color=TINTA)

    eixo.axvline(limiar_atual, color=CINZA, linestyle="--", linewidth=1)
    eixo.annotate(f"limiar atual ({limiar_atual:.2f})", (limiar_atual, 2), xytext=(4, 0),
                  textcoords="offset points", fontsize=8, color=TINTA_SUAVE)

    eixo.set_ylim(0, 105)
    eixo.set_xticks(x)
    eixo.set_xlabel("Limiar de confiança")
    eixo.set_ylabel("%")
    eixo.grid(axis="y", color="#e3e6e2", linewidth=0.6)
    _eixos_limpos(eixo)
    eixo.legend(loc="lower left", frameon=False, fontsize=8)
    _salvar(figura, caminho_sem_extensao)


def comparacao_f1(tabela, rotulo_antes, rotulo_depois, caminho_sem_extensao, eixo_x="F1 por intenção (validação cruzada)"):
    """F1 por intenção antes e depois, ligados por um traço; ordenado pelo depois."""
    if _sem_matplotlib():
        return

    tabela = tabela.sort_values("f1_depois")
    n = len(tabela)
    figura, eixo = plt.subplots(figsize=(7, max(4, n * 0.32)))
    y = np.arange(n)

    eixo.hlines(y, tabela["f1_antes"], tabela["f1_depois"], color="#cfd5d1", linewidth=2)
    eixo.scatter(tabela["f1_antes"], y, color=CINZA, s=36, zorder=3, label=rotulo_antes)
    eixo.scatter(tabela["f1_depois"], y, color=VERDE, s=36, zorder=3, label=rotulo_depois)

    for posicao, (_, linha) in zip(y, tabela.iterrows()):
        diferenca = linha["f1_depois"] - linha["f1_antes"]
        if abs(diferenca) >= 0.005:
            eixo.annotate(f"{diferenca:+.2f}", (max(linha["f1_antes"], linha["f1_depois"]), posicao),
                          xytext=(6, 0), textcoords="offset points", va="center", fontsize=7, color=TINTA_SUAVE)

    eixo.set_yticks(y, labels=tabela["intencao"], fontsize=8)
    eixo.set_xlim(0, 1.08)
    eixo.set_xlabel(eixo_x)
    eixo.grid(axis="x", color="#e3e6e2", linewidth=0.6)
    _eixos_limpos(eixo)
    eixo.legend(loc="lower right", frameon=False, fontsize=8)
    _salvar(figura, caminho_sem_extensao)
