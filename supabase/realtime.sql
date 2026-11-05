-- Tabelas transmitidas pelo Supabase Realtime (postgres_changes).
-- O backend do painel (atendimento-bot/src/painel/tempoReal.js) escuta mudanças
-- em "chamados" e inserções em "mensagens", e avisa os painéis abertos por SSE.
-- Publicações não entram no pg_dump com --schema=public; rode depois do schema.sql.

alter publication supabase_realtime add table public.chamados, public.mensagens;
