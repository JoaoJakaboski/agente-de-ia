# Classificador de intenções (camada 1)

Microsserviço em Python que recebe a mensagem de um cliente e diz qual é a
**intenção** dela (por exemplo, `precos_laser` ou `horario`) e com que
**confiança**. É a primeira camada do funil de atendimento: quando a confiança
passa do limiar, o bot responde na hora com a regra de FAQ dessa intenção, sem
chamar nenhum modelo de linguagem. Abaixo do limiar, a mensagem segue para a
camada 2 (IA classificadora) e, se preciso, para a camada 3 (agente de IA).

```
mensagem do cliente
      │
      ▼
 camada 1: classificador (este serviço) ── confiança ≥ limiar ──► regra de FAQ
      │ confiança < limiar
      ▼
 camada 2: IA classificadora ── intenção com regra ──► regra de FAQ
      │ sem regra
      ▼
 camada 3: agente de IA ──► conversa, coleta dados, encaminha ou encerra
```

O objetivo da camada 1 é responder as perguntas frequentes **sem custo de IA e
em milissegundos**, deixando os modelos de linguagem só para o que ela não
consegue resolver com segurança.

## Como funciona

1. **Pré-processamento (TF-IDF).** O texto vira um vetor numérico: cada palavra
   do vocabulário do dataset recebe um peso que cresce com a frequência dela na
   frase e diminui quanto mais comum ela é no dataset inteiro. Palavras como
   "de" e "o" pesam pouco; "pix" ou "stl" pesam muito.
2. **Classificação (SVM linear).** Uma máquina de vetores de suporte com kernel
   linear separa as intenções no espaço desses vetores. Foi escolhida por
   comparação com o Naive Bayes multinomial (ver [Resultados atuais](#resultados-atuais-tetraprint)).
3. **Confiança.** O SVM é treinado com `probability=True`, que calibra as
   pontuações em probabilidades (método de Platt). A confiança devolvida é a
   maior probabilidade entre as intenções.
4. **Limiar.** Quem decide o que fazer com a confiança é o atendimento-bot,
   comparando com o limiar configurado no painel (Agente → limiar de confiança,
   hoje **0,7**). O serviço só classifica.

Cada empresa tem o próprio modelo, treinado com o próprio dataset, em
`modelo/<slug>/`. O slug é o mesmo do campo `slug` da tabela `empresas`.

## Estrutura

```
classificador-ml/
├── servidor.py               API HTTP usada pelo atendimento-bot
├── treinar.py                treina, avalia e salva o modelo de uma empresa
├── comparar.py               compara duas avaliações (ex.: antes e depois de mexer no dataset)
├── palavras_chave.py         baseline de palavras-chave, avaliado ao lado do SVM
├── graficos_avaliacao.py     gráficos da avaliação (matriz, limiar, comparações)
├── requirements.txt          dependências do servidor (vão para a imagem Docker)
├── requirements-treino.txt   dependências extras para treinar e gerar gráficos
├── Dockerfile
├── dataset/<slug>/
│   ├── mensagens_treino.csv  frases rotuladas usadas no treino
│   ├── teste_fixo.csv        frases que nunca entram no treino (régua fixa)
│   └── palavras_chave.json   termos por intenção do baseline
├── modelo/<slug>/
│   ├── vetorizador.joblib    TF-IDF treinado
│   └── classificador.joblib  SVM treinado
└── avaliacao/<slug>/<rótulo>/  relatórios de cada treino (ver abaixo)
```

## Bibliotecas

| Biblioteca | Onde | Para quê |
|---|---|---|
| **scikit-learn** | servidor e treino | TF-IDF (`TfidfVectorizer`), SVM (`SVC`), Naive Bayes (`MultinomialNB`), validação cruzada (`StratifiedKFold`, `cross_val_predict`) e métricas (`f1_score`, `classification_report`, `confusion_matrix`) |
| **joblib** | servidor e treino | Salvar e carregar o vetorizador e o modelo treinados (`.joblib`) |
| **Flask** | servidor | API HTTP com as rotas `/classificar` e `/saude` |
| **gunicorn** | servidor | Servidor de produção que roda o Flask com 2 processos (o `app.run` do Flask é só para desenvolvimento) |
| **pandas** | treino | Ler os CSVs do dataset e gravar os relatórios |
| **NumPy** | treino | Operações com vetores de probabilidade (vem junto com o scikit-learn) |
| **matplotlib** | só treino | Gráficos PNG/PDF da avaliação. Fica fora da imagem Docker para ela continuar leve |

As versões estão fixadas em `requirements.txt` (e `requirements-treino.txt`
acrescenta o matplotlib). Treine com as mesmas versões do servidor: um modelo
salvo com uma versão do scikit-learn pode não abrir em outra.

## API

O atendimento-bot chama o serviço pela variável `CLASSIFICADOR_URL`
(padrão `http://localhost:5001`), com tempo limite de 5 segundos. Se o serviço
falhar ou demorar, o bot segue direto para a camada 2.

**`POST /classificar`**

```json
{ "empresa": "tetraprint", "texto": "vocês aceitam pix?" }
```

Resposta `200`:

```json
{ "intencao": "pagamento", "confianca": 0.93 }
```

Erros: `400` se faltar `empresa` ou `texto`; `404` se não houver modelo
treinado para a empresa.

**`GET /saude`** responde `{"status": "ok"}` (usado para conferir se o serviço
está no ar).

Os modelos ficam em memória depois da primeira chamada de cada empresa. Por
isso, **depois de treinar de novo, faça o deploy (ou reinicie) o serviço** para
ele carregar o modelo novo.

## Dataset

`dataset/<slug>/mensagens_treino.csv`, com cabeçalho `texto,intencao`:

```csv
texto,intencao
vocês cortam mdf?,materiais_laser
aceita pix?,pagamento
```

- Cada intenção precisa de **pelo menos 5 frases** (uma para cada parte da
  validação cruzada); o ideal é 20 ou mais.
- O nome da intenção é o mesmo do campo `intencao` da regra de FAQ no painel.
- Escreva as frases como o cliente escreve: com abreviações, sem acento, com
  erros comuns. Frases quase iguais entre si inflam as métricas sem ajudar o
  modelo.

`dataset/<slug>/teste_fixo.csv` tem o mesmo formato, com algumas frases por
intenção que **nunca entram no treino**. Ele é a régua para comparar versões
do dataset (ver [Teste fixo](#teste-fixo)). O ideal é ir trocando as frases
dele por mensagens reais de clientes e, a partir daí, não mexer mais.

## Treinar

```bash
pip install -r requirements-treino.txt
python treinar.py tetraprint --rotulo depois --limiar 0.7
```

- `--rotulo`: nome da avaliação (padrão: data e hora). Cada rótulo tem a
  própria pasta em `avaliacao/<slug>/`, então treinar de novo não apaga as
  avaliações anteriores.
- `--limiar`: o limiar usado no bot, para o relatório mostrar a cobertura nele
  (padrão: 0,7).

O script faz, em ordem:

1. Compara SVM e Naive Bayes por **validação cruzada estratificada com 5
   partes**: o dataset é dividido em 5 partes com a mesma proporção de cada
   intenção; o modelo treina com 4 e é testado na que sobrou, 5 vezes. Toda
   frase é testada uma vez, por um modelo que não a viu. O TF-IDF fica dentro
   de um pipeline, então em cada rodada ele só aprende o vocabulário das
   frases de treino daquela rodada.
2. Escolhe o modelo com maior **F1 macro** e gera o relatório dele.
3. Treina o modelo escolhido com **todas** as frases e salva em
   `modelo/<slug>/`.
4. Se existir `teste_fixo.csv`, avalia esse modelo final nas frases dele.

### O que fica em `avaliacao/<slug>/<rótulo>/`

| Arquivo | O que é |
|---|---|
| `resumo.json` | Números principais da execução (lido pelo `comparar.py` e pelo `palavras_chave.py`) |
| `comparacao_modelos.csv` | F1 macro (média e desvio entre as 5 partes) e acurácia de SVM e Naive Bayes |
| `metricas_por_intencao.csv` | Precisão, revocação e F1 de cada intenção |
| `matriz_confusao.png` / `.pdf` / `.csv` | Intenção real × prevista. Diagonal ( / ) em verde com a % de acerto; confusões em magenta com o nº de frases |
| `cobertura_por_limiar.png` / `.pdf` / `.csv` | Para cada limiar: quantas frases a camada 1 responderia sozinha e com que acerto |
| `erros.csv` | Frases que o modelo errou, com a intenção prevista: o material para melhorar o dataset |

### Como ler as métricas

- **Precisão** de uma intenção: das frases que o modelo disse ser dela, quantas
  eram. **Revocação**: das frases dela, quantas o modelo acertou.
  **F1**: média harmônica das duas.
- **F1 macro**: média do F1 de todas as intenções, cada uma com o mesmo peso.
  É a métrica principal porque o dataset é desbalanceado (13 a 50 frases por
  intenção) e a acurácia esconderia as intenções pequenas.
- **Cobertura por limiar**: com limiar alto, a camada 1 responde menos frases,
  mas erra menos. É a troca entre custo (mais frases indo para a IA) e
  qualidade (mais respostas erradas de FAQ).

## Comparar versões do dataset

```bash
python treinar.py tetraprint --rotulo antes
# ...altere o mensagens_treino.csv...
python treinar.py tetraprint --rotulo depois
python comparar.py tetraprint antes depois
```

Grava em `avaliacao/<slug>/comparacao_antes_x_depois/`: `visao_geral.csv`,
`por_intencao.csv` e `f1_por_intencao.png`/`.pdf` (F1 de cada intenção antes e
depois, ligados por um traço).

### Teste fixo

A validação cruzada mede cada dataset contra ele mesmo: acrescentar frases
parecidas com as que já existem faz o F1 subir sem o modelo ter melhorado de
verdade. O teste fixo é a mesma régua para as duas versões. Se a validação
cruzada sobe e o teste fixo não, a melhora foi só aparente; se uma intenção
sobe e outra cai, as frases novas estão puxando frases de uma intenção vizinha.

## Baseline de palavras-chave

```bash
python palavras_chave.py tetraprint --rotulo depois
```

Uma regra simples, sem aprendizado: cada intenção tem uma lista de termos em
`dataset/<slug>/palavras_chave.json`. A frase é normalizada (minúsculas, sem
acento e sem pontuação) e cada termo encontrado soma pontos para a intenção
dele (termos com mais palavras valem mais). Ganha a maior pontuação; sem
nenhum termo, a frase fica sem resposta. Serve para mostrar quanto o
aprendizado de máquina acrescenta em relação ao jeito mais simples de resolver
o problema.

Os termos foram tirados **só das frases de treino** de cada intenção; o script
avisa se algum termo não aparece no treino, para não usar informação do teste
fixo. Como a regra não aprende, avaliá-la em todas as frases equivale a juntar
as 5 partes de teste da validação cruzada. Ainda assim, ela é **otimista no
dataset** (os termos vieram dele); a comparação justa é no teste fixo.

Grava em `avaliacao/<slug>/<rótulo>/palavras_chave/`: `comparacao_com_svm.csv`,
`metricas_por_intencao.csv`, `por_intencao.csv`, `f1_por_intencao.png`/`.pdf`
e `erros.csv`.

## Resultados atuais (TetraPrint)

Dataset com 680 frases e 23 intenções; teste fixo com 69 frases (3 por
intenção). Os números da avaliação oficial estão em `avaliacao/tetraprint/`.

| | Palavras-chave | Naive Bayes | SVM |
|---|---|---|---|
| F1 macro (validação cruzada) | 0,679¹ | 0,494 | **0,774** |
| F1 macro (teste fixo) | 0,408 | — | **0,724** |
| Frases respondidas na camada 1 (teste fixo, limiar 0,7) | 50,7% | — | 27,5% |
| Acerto nessas respostas (teste fixo) | 65,7% | — | **100%** |

¹ Avaliada em todas as frases, de onde os termos foram tirados (otimista).

Com o limiar em 0,7, a camada 1 responde cerca de 40% das frases do dataset,
acertando 96%. As intenções mais fracas são as "gerais" (`precos_geral`,
`orcamento_geral`), que se confundem com as específicas de laser e de 3D.

## Deploy

A imagem Docker instala só o `requirements.txt` e sobe o gunicorn na porta
`5001` (variável `PORT`). Os arquivos de `modelo/` vão dentro da imagem, então
o fluxo para atualizar o modelo é: treinar, commitar `modelo/<slug>/` e
fazer o deploy do serviço.

## Nova empresa

1. Crie `dataset/<slug>/mensagens_treino.csv` com o mesmo slug da empresa no
   banco e as intenções das regras de FAQ dela.
2. Rode `python treinar.py <slug>` e confira o relatório.
3. Commite `modelo/<slug>/` e faça o deploy.

Enquanto não houver modelo, o serviço responde `404` para essa empresa e o bot
usa só as camadas 2 e 3.

## Limitações

- O dataset é sintético (escrito a partir das dúvidas esperadas, não de
  conversas reais) e de uma única empresa.
- O TF-IDF não entende sinônimos que não estão no dataset nem o contexto da
  conversa: cada mensagem é classificada sozinha. Isso fica para as camadas 2
  e 3, que recebem o histórico.
- O teste fixo é pequeno: com 69 frases, cada uma vale cerca de 1,4 ponto
  percentual.
