-- Extensões usadas pelo esquema public.
-- O pg_dump com --schema=public não inclui extensões; rode este arquivo antes do schema.sql.

-- busca sem acento (views chamados_lista e clientes_lista)
create extension if not exists unaccent with schema extensions;
