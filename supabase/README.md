# Banco de dados (Supabase)

Esquema do banco usado pelo atendimento-bot e pelo painel-web. Roda em um
Supabase self-hosted (PostgreSQL 15) e depende do que o Supabase já traz:
o schema `auth` (login), as funções `auth.uid()` e os papéis `anon`,
`authenticated` e `service_role`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `extensoes.sql` | Extensões usadas pelo esquema (`unaccent`, para a busca sem acento) |
| `schema.sql` | Esquema completo do schema `public`, exportado do banco com `pg_dump` (sem dados) |
| `realtime.sql` | Tabelas transmitidas pelo Realtime para o painel atualizar sozinho |

O `pg_dump` limitado ao schema `public` não exporta extensões nem a publicação
do Realtime; por isso elas ficam em arquivos à parte.

## O que tem no esquema

**Tabelas**

| Tabela | Para quê |
|---|---|
| `empresas` | Empresas atendidas (multiempresa): nome, slug do classificador e instância da Evolution |
| `configuracoes_agente` | Configuração do bot por empresa: prompt do agente, modelo, limiar de confiança, agrupamento de mensagens, inatividade, bot ligado |
| `regras_faq` | Respostas prontas por intenção, e se a regra encaminha para humano ou inicia o agente |
| `clientes` | Um registro por telefone em cada empresa, com o nome |
| `chamados` | Cada atendimento: cliente, status, assunto, atendente, contexto resumido pela IA e encerramento |
| `mensagens` | Mensagens de cada chamado, com remetente e, nas respostas do bot, a camada do funil e a intenção |
| `eventos_chamado` | Histórico de mudanças de status e de atendente (preenchido por trigger) |
| `usuarios` | Atendentes e administradores (o `id` é o mesmo do `auth.users`) |
| `tokens_senha` | Links de convite e de redefinição de senha (só o hash do token) |
| `uso_llm` | Tokens gastos em cada chamada às camadas de IA |
| `precos_modelo` | Preço de cada modelo por empresa, para o custo no painel |

**Views**: `chamados_lista` (lista de chamados do painel, com última mensagem,
desde quando está no status atual e coluna de busca sem acento) e
`clientes_lista` (clientes com total de chamados e chamado aberto).

**Funções**

| Função | Quem chama | Para quê |
|---|---|---|
| `empresa_do_usuario()`, `papel_do_usuario()` | Políticas de RLS | Empresa e papel do usuário logado (só se ativo) |
| `registrar_evento_chamado()` | Trigger em `chamados` | Grava em `eventos_chamado` cada mudança de status ou de atendente |
| `excluir_cliente()` | Backend (service_role) | Apaga um cliente e todo o histórico dele numa transação |
| `usuario_por_email()`, `usuarios_da_empresa()` | Backend (service_role) | Ler dados de `auth.users` para senha e gestão de atendentes |
| `indicadores_funil()`, `indicadores_ia()`, `indicadores_atendimento()` | Backend (service_role) | Números agregados da Visão geral |

As funções chamadas pelo backend têm a execução revogada de `anon` e
`authenticated`: só o service_role consegue chamá-las.

## Segurança (RLS)

Todas as tabelas têm RLS ligada. A regra geral é **leitura só da própria
empresa** (`leitura_empresa`, com `empresa_do_usuario()`), e **escrita só pelo
backend** com o service_role, depois de o backend conferir a permissão. As
exceções são `regras_faq` e `configuracoes_agente`, que administradores também
podem gravar (`escrita_admin`). `tokens_senha` não tem política nenhuma: nenhum
usuário lê, só o backend. As views usam `security_invoker`, então a RLS das
tabelas vale para elas também.

## Recriar o banco

Num Supabase novo, pelo SQL Editor ou pelo `psql`, nesta ordem:

1. `extensoes.sql`
2. `schema.sql`. A primeira instrução (`CREATE SCHEMA public`) dá erro de
   "already exists", porque o Supabase já cria esse schema; pode ignorar. No
   `psql`, o padrão é seguir depois do erro.
3. `realtime.sql`

Depois, crie a empresa, a configuração do agente e o primeiro administrador
(usuário no Supabase Auth e linha em `usuarios` com o mesmo `id` e
`papel = 'admin'`).

## Atualizar o schema.sql

Depois de mudanças no banco, exporte de novo na VPS e substitua o arquivo:

```bash
docker ps --format '{{.Names}}' | grep -i db
docker exec <container-do-db> pg_dump -U postgres --schema-only --schema=public --no-owner postgres > /root/schema.sql
```

E no seu computador: `scp root@<ip-da-vps>:/root/schema.sql supabase/schema.sql`.
Se a mudança envolver uma extensão nova ou outra tabela no Realtime, atualize
também `extensoes.sql` ou `realtime.sql`.

Para conferir quais tabelas estão no Realtime:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
