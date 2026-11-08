--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: empresa_do_usuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.empresa_do_usuario() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select empresa_id from usuarios where id = auth.uid() and ativo = true
$$;


--
-- Name: excluir_cliente(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.excluir_cliente(p_cliente_id uuid, p_empresa_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  v_chamados uuid[];
begin
  -- trava o cliente: uma mensagem chegando agora espera a exclusão terminar
  perform 1 from public.clientes
   where id = p_cliente_id and empresa_id = p_empresa_id
   for update;
  if not found then
    return 'nao_encontrado';
  end if;

  if exists (select 1 from public.chamados where cliente_id = p_cliente_id and status <> 'encerrado') then
    return 'chamado_aberto';
  end if;

  select coalesce(array_agg(id), '{}') into v_chamados
    from public.chamados where cliente_id = p_cliente_id;

  update public.uso_llm set chamado_id = null where chamado_id = any(v_chamados);
  delete from public.mensagens where chamado_id = any(v_chamados);
  delete from public.eventos_chamado where chamado_id = any(v_chamados);
  delete from public.chamados where id = any(v_chamados);
  delete from public.clientes where id = p_cliente_id;

  return 'ok';
end;
$$;


--
-- Name: indicadores_atendimento(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.indicadores_atendimento(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
with ev as (
  select e.chamado_id, e.status_novo, e.atendente_id, e.criado_em,
         lead(e.status_novo) over w as prox_status,
         lead(e.criado_em) over w as prox_em
    from eventos_chamado e
    join chamados c on c.id = e.chamado_id
   where c.empresa_id = p_empresa_id
  window w as (partition by e.chamado_id order by e.criado_em, e.id)
),
fila as (
  -- da entrada em "Aguardando atendente" até alguém assumir
  select extract(epoch from prox_em - criado_em) / 60.0 as minutos
    from ev
   where status_novo = 'aguardando_humano' and prox_status = 'em_atendimento_humano'
     and prox_em >= p_de and prox_em < p_ate
),
atend as (
  -- cada período com um atendente: de assumir até encerrar, devolver à fila ou outro assumir
  select atendente_id, prox_status, extract(epoch from prox_em - criado_em) / 60.0 as minutos
    from ev
   where status_novo = 'em_atendimento_humano' and atendente_id is not null and prox_em is not null
     and criado_em >= p_de and criado_em < p_ate
),
assumidos as (
  select atendente_id, count(*) as total
    from ev
   where status_novo = 'em_atendimento_humano' and atendente_id is not null
     and criado_em >= p_de and criado_em < p_ate
   group by 1
)
select jsonb_build_object(
  'aguardando_agora', (select count(*) from chamados where empresa_id = p_empresa_id and status = 'aguardando_humano'),
  'em_atendimento_agora', (select count(*) from chamados where empresa_id = p_empresa_id and status = 'em_atendimento_humano'),
  'fila', (select jsonb_build_object('total', count(*), 'media_min', avg(minutos),
                                     'mediana_min', percentile_cont(0.5) within group (order by minutos)) from fila),
  'duracao', (select jsonb_build_object('total', count(*), 'media_min', avg(minutos),
                                        'mediana_min', percentile_cont(0.5) within group (order by minutos)) from atend),
  'por_atendente', coalesce((
    select jsonb_agg(jsonb_build_object(
             'atendente_id', a.atendente_id,
             'nome', usr.nome,
             'ativo', usr.ativo,
             'assumidos', a.total,
             'encerrados', (select count(*) from atend t where t.atendente_id = a.atendente_id and t.prox_status = 'encerrado'),
             'media_min', (select avg(minutos) from atend t where t.atendente_id = a.atendente_id)
           ) order by a.total desc)
      from assumidos a
      left join usuarios usr on usr.id = a.atendente_id
  ), '[]'::jsonb)
);
$$;


--
-- Name: indicadores_funil(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.indicadores_funil(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
with ch as (
  select c.id, c.status, c.assunto, c.motivo_encerramento, c.criado_em,
         (c.atendente_id is not null
          or exists (select 1 from eventos_chamado e
                      where e.chamado_id = c.id
                        and e.status_novo in ('aguardando_humano', 'em_atendimento_humano'))) as teve_humano
    from chamados c
   where c.empresa_id = p_empresa_id
     and c.criado_em >= p_de and c.criado_em < p_ate
     and coalesce(c.assunto, '') <> 'iniciado_pelo_painel'
),
msg as (
  select m.camada, m.intencao
    from mensagens m
   where m.empresa_id = p_empresa_id and m.camada is not null
     and m.criado_em >= p_de and m.criado_em < p_ate
)
select jsonb_build_object(
  'total', (select count(*) from ch),
  'em_aberto', (select count(*) from ch where status <> 'encerrado'),
  'encerrados', (select count(*) from ch where status = 'encerrado'),
  'resolvidos_sem_humano', (select count(*) from ch where status = 'encerrado' and not teve_humano),
  'com_humano', (select count(*) from ch where teve_humano),
  'escalados_por_motivo', coalesce((
    select jsonb_agg(jsonb_build_object('motivo', motivo, 'total', total) order by total desc)
      from (select coalesce(assunto, 'sem_motivo') as motivo, count(*) as total from ch where teve_humano group by 1) x
  ), '[]'::jsonb),
  'encerramentos_por_motivo', coalesce((
    select jsonb_agg(jsonb_build_object('motivo', motivo, 'total', total) order by total desc)
      from (select coalesce(motivo_encerramento, 'sem_motivo') as motivo, count(*) as total
              from ch where status = 'encerrado' group by 1) x
  ), '[]'::jsonb),
  'por_dia', coalesce((
    select jsonb_agg(jsonb_build_object('dia', dia, 'total', total, 'sem_humano', sem_humano) order by dia)
      from (select (criado_em at time zone 'America/Sao_Paulo')::date as dia,
                   count(*) as total,
                   count(*) filter (where status = 'encerrado' and not teve_humano) as sem_humano
              from ch group by 1) x
  ), '[]'::jsonb),
  'respostas_por_camada', coalesce((
    select jsonb_agg(jsonb_build_object('camada', camada, 'total', total) order by total desc)
      from (select camada, count(*) as total from msg group by 1) x
  ), '[]'::jsonb),
  'intencoes', coalesce((
    select jsonb_agg(jsonb_build_object('intencao', intencao, 'total', total) order by total desc)
      from (select intencao, count(*) as total from msg
             where intencao is not null and camada in ('ml', 'llm')
             group by 1 order by 2 desc limit 10) x
  ), '[]'::jsonb)
);
$$;


--
-- Name: indicadores_ia(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.indicadores_ia(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
with u as (
  select u.camada, u.modelo, u.chamado_id, u.criado_em, u.tokens_entrada, u.tokens_saida,
         (u.tokens_entrada * coalesce(p.preco_entrada_mtok, 0)
          + u.tokens_saida * coalesce(p.preco_saida_mtok, 0)) / 1000000.0 as custo,
         p.modelo is null as sem_preco
    from uso_llm u
    left join precos_modelo p on p.empresa_id = u.empresa_id and p.modelo = u.modelo
   where u.empresa_id = p_empresa_id
     and u.criado_em >= p_de and u.criado_em < p_ate
)
select jsonb_build_object(
  'chamadas', (select count(*) from u),
  'tokens_entrada', (select coalesce(sum(tokens_entrada), 0) from u),
  'tokens_saida', (select coalesce(sum(tokens_saida), 0) from u),
  'custo', (select coalesce(sum(custo), 0) from u),
  'chamados_com_ia', (select count(distinct chamado_id) from u),
  'modelos_sem_preco', coalesce((select jsonb_agg(distinct modelo) from u where sem_preco), '[]'::jsonb),
  'por_dia', coalesce((
    select jsonb_agg(jsonb_build_object('dia', dia, 'custo', custo, 'tokens', tokens) order by dia)
      from (select (criado_em at time zone 'America/Sao_Paulo')::date as dia,
                   sum(custo) as custo, sum(tokens_entrada + tokens_saida) as tokens
              from u group by 1) x
  ), '[]'::jsonb),
  'por_camada', coalesce((
    select jsonb_agg(jsonb_build_object('camada', camada, 'chamadas', chamadas, 'tokens_entrada', entrada,
                                        'tokens_saida', saida, 'custo', custo) order by custo desc)
      from (select camada, count(*) as chamadas, sum(tokens_entrada) as entrada,
                   sum(tokens_saida) as saida, sum(custo) as custo
              from u group by 1) x
  ), '[]'::jsonb),
  'por_modelo', coalesce((
    select jsonb_agg(jsonb_build_object('modelo', modelo, 'chamadas', chamadas, 'tokens_entrada', entrada,
                                        'tokens_saida', saida, 'custo', custo) order by custo desc)
      from (select modelo, count(*) as chamadas, sum(tokens_entrada) as entrada,
                   sum(tokens_saida) as saida, sum(custo) as custo
              from u group by 1) x
  ), '[]'::jsonb),
  'respostas_agente', (select count(*) from mensagens m
                        where m.empresa_id = p_empresa_id and m.camada = 'agente'
                          and m.criado_em >= p_de and m.criado_em < p_ate),
  'falhas_agente', (select count(*) from mensagens m
                     where m.empresa_id = p_empresa_id and m.camada = 'agente_falha'
                       and m.criado_em >= p_de and m.criado_em < p_ate)
);
$$;


--
-- Name: papel_do_usuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.papel_do_usuario() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select papel from usuarios where id = auth.uid() and ativo = true
$$;


--
-- Name: registrar_evento_chamado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_evento_chamado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.atendente_id is distinct from old.atendente_id then
    insert into eventos_chamado (chamado_id, empresa_id, status_anterior, status_novo, atendente_id, motivo)
    values (
      new.id,
      new.empresa_id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      new.atendente_id,
      case when new.status = 'encerrado' then new.motivo_encerramento else new.assunto end
    );
  end if;
  return new;
end;
$$;


--
-- Name: usuario_por_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.usuario_por_email(p_email text) RETURNS TABLE(id uuid, nome text, ativo boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select u.id, u.nome, u.ativo
    from public.usuarios u
    join auth.users a on a.id = u.id
   where lower(a.email) = lower(trim(p_email))
   limit 1;
$$;


--
-- Name: usuarios_da_empresa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.usuarios_da_empresa(p_empresa_id uuid) RETURNS TABLE(id uuid, nome text, papel text, ativo boolean, email text, ultimo_acesso timestamp with time zone, criado_em timestamp with time zone, em_andamento bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select u.id, u.nome::text, u.papel::text, u.ativo, a.email::text, a.last_sign_in_at, a.created_at,
         (select count(*) from public.chamados c
           where c.atendente_id = u.id and c.status = 'em_atendimento_humano')
    from public.usuarios u
    join auth.users a on a.id = u.id
   where u.empresa_id = p_empresa_id
   order by u.ativo desc, u.nome;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chamados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chamados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    telefone_cliente text NOT NULL,
    assunto text,
    status text DEFAULT 'bot'::text NOT NULL,
    atendente_id uuid,
    motivo_encerramento text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    encerrado_em timestamp with time zone,
    contexto text,
    observacao_encerramento text,
    cliente_id uuid NOT NULL,
    CONSTRAINT chamados_motivo_encerramento_check CHECK ((motivo_encerramento = ANY (ARRAY['resolvido_bot'::text, 'resolvido_humano'::text, 'abandonado'::text, 'inatividade'::text, 'fora_do_escopo'::text, 'outro'::text]))),
    CONSTRAINT chamados_observacao_encerramento_check CHECK ((((motivo_encerramento IS DISTINCT FROM 'outro'::text) OR (length(TRIM(BOTH FROM COALESCE(observacao_encerramento, ''::text))) > 0)) AND (length(COALESCE(observacao_encerramento, ''::text)) <= 500))),
    CONSTRAINT chamados_status_check CHECK ((status = ANY (ARRAY['bot'::text, 'agente'::text, 'aguardando_humano'::text, 'em_atendimento_humano'::text, 'encerrado'::text])))
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    telefone text NOT NULL,
    nome text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    privacidade_versao integer,
    privacidade_informado_em timestamp with time zone,
    CONSTRAINT clientes_nome_check CHECK (((nome IS NULL) OR ((char_length(nome) >= 1) AND (char_length(nome) <= 80))))
);


--
-- Name: eventos_chamado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_chamado (
    id bigint NOT NULL,
    chamado_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    status_anterior text,
    status_novo text NOT NULL,
    atendente_id uuid,
    motivo text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chamado_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    remetente text NOT NULL,
    atendente_id uuid,
    conteudo text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    camada text,
    intencao text,
    CONSTRAINT mensagens_camada_check CHECK ((camada = ANY (ARRAY['ml'::text, 'llm'::text, 'agente'::text, 'agente_falha'::text]))),
    CONSTRAINT mensagens_remetente_check CHECK ((remetente = ANY (ARRAY['cliente'::text, 'bot'::text, 'humano'::text])))
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    nome text NOT NULL,
    papel text DEFAULT 'atendente'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usuarios_papel_check CHECK ((papel = ANY (ARRAY['admin'::text, 'atendente'::text])))
);


--
-- Name: chamados_lista; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.chamados_lista WITH (security_invoker='true') AS
 SELECT c.id,
    c.empresa_id,
    cl.nome AS nome_cliente,
    c.telefone_cliente,
    c.status,
    c.assunto,
    c.atendente_id,
    u.nome AS atendente_nome,
    c.motivo_encerramento,
    c.criado_em,
    c.atualizado_em,
    c.encerrado_em,
    m.conteudo AS ultima_mensagem,
    m.remetente AS ultima_mensagem_remetente,
    m.criado_em AS ultima_mensagem_em,
    e.criado_em AS status_desde,
    c.observacao_encerramento,
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, ((((COALESCE(cl.nome, ''::text) || ' '::text) || COALESCE(c.telefone_cliente, ''::text)) || ' '::text) || COALESCE(c.assunto, ''::text)))) AS busca,
    c.cliente_id
   FROM ((((public.chamados c
     JOIN public.clientes cl ON ((cl.id = c.cliente_id)))
     LEFT JOIN public.usuarios u ON ((u.id = c.atendente_id)))
     LEFT JOIN LATERAL ( SELECT mensagens.conteudo,
            mensagens.remetente,
            mensagens.criado_em
           FROM public.mensagens
          WHERE (mensagens.chamado_id = c.id)
          ORDER BY mensagens.criado_em DESC
         LIMIT 1) m ON (true))
     LEFT JOIN LATERAL ( SELECT eventos_chamado.criado_em
           FROM public.eventos_chamado
          WHERE ((eventos_chamado.chamado_id = c.id) AND (eventos_chamado.status_novo = c.status))
          ORDER BY eventos_chamado.criado_em DESC
         LIMIT 1) e ON (true));


--
-- Name: clientes_lista; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.clientes_lista WITH (security_invoker='true') AS
 SELECT cl.id,
    cl.empresa_id,
    cl.nome,
    cl.telefone,
    cl.criado_em,
    cl.atualizado_em,
    t.total AS total_chamados,
    u.criado_em AS ultimo_chamado_em,
    a.id AS chamado_aberto_id,
    a.status AS chamado_aberto_status,
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, ((COALESCE(cl.nome, ''::text) || ' '::text) || cl.telefone))) AS busca,
    cl.privacidade_versao,
    cl.privacidade_informado_em
   FROM (((public.clientes cl
     LEFT JOIN LATERAL ( SELECT count(*) AS total
           FROM public.chamados c
          WHERE (c.cliente_id = cl.id)) t ON (true))
     LEFT JOIN LATERAL ( SELECT c.criado_em
           FROM public.chamados c
          WHERE (c.cliente_id = cl.id)
          ORDER BY c.criado_em DESC
         LIMIT 1) u ON (true))
     LEFT JOIN LATERAL ( SELECT c.id,
            c.status
           FROM public.chamados c
          WHERE ((c.cliente_id = cl.id) AND (c.status <> 'encerrado'::text))
         LIMIT 1) a ON (true));


--
-- Name: configuracoes_agente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes_agente (
    empresa_id uuid NOT NULL,
    system_prompt text NOT NULL,
    modelo text DEFAULT 'claude-sonnet-5'::text NOT NULL,
    limiar_faq numeric DEFAULT 0.85 NOT NULL,
    segundos_debounce integer DEFAULT 7 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    horas_inatividade_chamado numeric DEFAULT 24 NOT NULL
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    telefone_whatsapp text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    instancia_evolution text
);


--
-- Name: eventos_chamado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.eventos_chamado ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.eventos_chamado_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: precos_modelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precos_modelo (
    empresa_id uuid NOT NULL,
    modelo text NOT NULL,
    preco_entrada_mtok numeric(10,4) NOT NULL,
    preco_saida_mtok numeric(10,4) NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT precos_modelo_preco_entrada_mtok_check CHECK ((preco_entrada_mtok >= (0)::numeric)),
    CONSTRAINT precos_modelo_preco_saida_mtok_check CHECK ((preco_saida_mtok >= (0)::numeric))
);


--
-- Name: regras_faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_faq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    intencao text NOT NULL,
    resposta text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    escalar_humano boolean DEFAULT false NOT NULL,
    descricao_intencao text,
    inicia_agente boolean DEFAULT false NOT NULL
);


--
-- Name: tokens_senha; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens_senha (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    token_hash text NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    usado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tokens_senha_tipo_check CHECK ((tipo = ANY (ARRAY['convite'::text, 'redefinicao'::text])))
);


--
-- Name: uso_llm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uso_llm (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    chamado_id uuid,
    camada text NOT NULL,
    modelo text NOT NULL,
    tokens_entrada integer NOT NULL,
    tokens_saida integer NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT uso_llm_camada_check CHECK ((camada = ANY (ARRAY['classificadora'::text, 'agente'::text])))
);


--
-- Name: chamados chamados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamados
    ADD CONSTRAINT chamados_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_empresa_id_telefone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_empresa_id_telefone_key UNIQUE (empresa_id, telefone);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: configuracoes_agente configuracoes_agente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_agente
    ADD CONSTRAINT configuracoes_agente_pkey PRIMARY KEY (empresa_id);


--
-- Name: empresas empresas_instancia_evolution_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_instancia_evolution_key UNIQUE (instancia_evolution);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_slug_key UNIQUE (slug);


--
-- Name: empresas empresas_telefone_whatsapp_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_telefone_whatsapp_key UNIQUE (telefone_whatsapp);


--
-- Name: eventos_chamado eventos_chamado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_chamado
    ADD CONSTRAINT eventos_chamado_pkey PRIMARY KEY (id);


--
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);


--
-- Name: precos_modelo precos_modelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precos_modelo
    ADD CONSTRAINT precos_modelo_pkey PRIMARY KEY (empresa_id, modelo);


--
-- Name: regras_faq regras_faq_empresa_id_intencao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_faq
    ADD CONSTRAINT regras_faq_empresa_id_intencao_key UNIQUE (empresa_id, intencao);


--
-- Name: regras_faq regras_faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_faq
    ADD CONSTRAINT regras_faq_pkey PRIMARY KEY (id);


--
-- Name: tokens_senha tokens_senha_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_senha
    ADD CONSTRAINT tokens_senha_pkey PRIMARY KEY (id);


--
-- Name: tokens_senha tokens_senha_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_senha
    ADD CONSTRAINT tokens_senha_token_hash_key UNIQUE (token_hash);


--
-- Name: uso_llm uso_llm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_llm
    ADD CONSTRAINT uso_llm_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: chamados_cliente_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamados_cliente_id_idx ON public.chamados USING btree (cliente_id);


--
-- Name: chamados_empresa_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamados_empresa_criado_idx ON public.chamados USING btree (empresa_id, criado_em);


--
-- Name: chamados_empresa_status_encerrado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamados_empresa_status_encerrado_idx ON public.chamados USING btree (empresa_id, status, encerrado_em DESC);


--
-- Name: chamados_empresa_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chamados_empresa_status_idx ON public.chamados USING btree (empresa_id, status);


--
-- Name: chamados_um_aberto_por_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chamados_um_aberto_por_cliente ON public.chamados USING btree (cliente_id) WHERE (status <> 'encerrado'::text);


--
-- Name: eventos_chamado_chamado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_chamado_chamado_idx ON public.eventos_chamado USING btree (chamado_id, criado_em DESC);


--
-- Name: idx_chamados_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chamados_telefone ON public.chamados USING btree (empresa_id, telefone_cliente);


--
-- Name: idx_usuarios_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_empresa ON public.usuarios USING btree (empresa_id);


--
-- Name: mensagens_chamado_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensagens_chamado_criado_idx ON public.mensagens USING btree (chamado_id, criado_em DESC);


--
-- Name: mensagens_empresa_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensagens_empresa_criado_idx ON public.mensagens USING btree (empresa_id, criado_em) WHERE (camada IS NOT NULL);


--
-- Name: tokens_senha_pendentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tokens_senha_pendentes_idx ON public.tokens_senha USING btree (usuario_id) WHERE (usado_em IS NULL);


--
-- Name: uso_llm_chamado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uso_llm_chamado_idx ON public.uso_llm USING btree (chamado_id);


--
-- Name: uso_llm_empresa_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uso_llm_empresa_criado_idx ON public.uso_llm USING btree (empresa_id, criado_em);


--
-- Name: chamados chamados_evento_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chamados_evento_status AFTER INSERT OR UPDATE OF status, atendente_id ON public.chamados FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_chamado();


--
-- Name: chamados chamados_atendente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamados
    ADD CONSTRAINT chamados_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES public.usuarios(id);


--
-- Name: chamados chamados_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamados
    ADD CONSTRAINT chamados_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: chamados chamados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamados
    ADD CONSTRAINT chamados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: configuracoes_agente configuracoes_agente_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_agente
    ADD CONSTRAINT configuracoes_agente_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: eventos_chamado eventos_chamado_atendente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_chamado
    ADD CONSTRAINT eventos_chamado_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: eventos_chamado eventos_chamado_chamado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_chamado
    ADD CONSTRAINT eventos_chamado_chamado_id_fkey FOREIGN KEY (chamado_id) REFERENCES public.chamados(id) ON DELETE CASCADE;


--
-- Name: eventos_chamado eventos_chamado_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_chamado
    ADD CONSTRAINT eventos_chamado_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_atendente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES public.usuarios(id);


--
-- Name: mensagens mensagens_chamado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_chamado_id_fkey FOREIGN KEY (chamado_id) REFERENCES public.chamados(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: precos_modelo precos_modelo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precos_modelo
    ADD CONSTRAINT precos_modelo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: regras_faq regras_faq_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_faq
    ADD CONSTRAINT regras_faq_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: tokens_senha tokens_senha_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_senha
    ADD CONSTRAINT tokens_senha_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: uso_llm uso_llm_chamado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_llm
    ADD CONSTRAINT uso_llm_chamado_id_fkey FOREIGN KEY (chamado_id) REFERENCES public.chamados(id);


--
-- Name: uso_llm uso_llm_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_llm
    ADD CONSTRAINT uso_llm_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: usuarios usuarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chamados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracoes_agente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes_agente ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracoes_agente escrita_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_admin ON public.configuracoes_agente TO authenticated USING (((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)) AND (( SELECT public.papel_do_usuario() AS papel_do_usuario) = 'admin'::text))) WITH CHECK (((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)) AND (( SELECT public.papel_do_usuario() AS papel_do_usuario) = 'admin'::text)));


--
-- Name: regras_faq escrita_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY escrita_admin ON public.regras_faq TO authenticated USING (((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)) AND (( SELECT public.papel_do_usuario() AS papel_do_usuario) = 'admin'::text))) WITH CHECK (((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)) AND (( SELECT public.papel_do_usuario() AS papel_do_usuario) = 'admin'::text)));


--
-- Name: eventos_chamado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_chamado ENABLE ROW LEVEL SECURITY;

--
-- Name: chamados leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.chamados FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: clientes leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.clientes FOR SELECT TO authenticated USING ((empresa_id = public.empresa_do_usuario()));


--
-- Name: configuracoes_agente leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.configuracoes_agente FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: empresas leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.empresas FOR SELECT TO authenticated USING ((id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: eventos_chamado leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.eventos_chamado FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: mensagens leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.mensagens FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: precos_modelo leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.precos_modelo FOR SELECT TO authenticated USING ((empresa_id = public.empresa_do_usuario()));


--
-- Name: regras_faq leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.regras_faq FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: uso_llm leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.uso_llm FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: usuarios leitura_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_empresa ON public.usuarios FOR SELECT TO authenticated USING ((empresa_id = ( SELECT public.empresa_do_usuario() AS empresa_do_usuario)));


--
-- Name: mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

--
-- Name: precos_modelo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.precos_modelo ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_faq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_faq ENABLE ROW LEVEL SECURITY;

--
-- Name: tokens_senha; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tokens_senha ENABLE ROW LEVEL SECURITY;

--
-- Name: uso_llm; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uso_llm ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;


--
-- Name: FUNCTION empresa_do_usuario(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.empresa_do_usuario() TO postgres;
GRANT ALL ON FUNCTION public.empresa_do_usuario() TO authenticated;
GRANT ALL ON FUNCTION public.empresa_do_usuario() TO service_role;


--
-- Name: FUNCTION excluir_cliente(p_cliente_id uuid, p_empresa_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.excluir_cliente(p_cliente_id uuid, p_empresa_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.excluir_cliente(p_cliente_id uuid, p_empresa_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.excluir_cliente(p_cliente_id uuid, p_empresa_id uuid) TO service_role;


--
-- Name: FUNCTION indicadores_atendimento(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.indicadores_atendimento(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.indicadores_atendimento(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO postgres;
GRANT ALL ON FUNCTION public.indicadores_atendimento(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO service_role;


--
-- Name: FUNCTION indicadores_funil(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.indicadores_funil(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.indicadores_funil(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO postgres;
GRANT ALL ON FUNCTION public.indicadores_funil(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO service_role;


--
-- Name: FUNCTION indicadores_ia(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.indicadores_ia(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.indicadores_ia(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO postgres;
GRANT ALL ON FUNCTION public.indicadores_ia(p_empresa_id uuid, p_de timestamp with time zone, p_ate timestamp with time zone) TO service_role;


--
-- Name: FUNCTION papel_do_usuario(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.papel_do_usuario() TO postgres;
GRANT ALL ON FUNCTION public.papel_do_usuario() TO authenticated;
GRANT ALL ON FUNCTION public.papel_do_usuario() TO service_role;


--
-- Name: FUNCTION registrar_evento_chamado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.registrar_evento_chamado() TO postgres;
GRANT ALL ON FUNCTION public.registrar_evento_chamado() TO anon;
GRANT ALL ON FUNCTION public.registrar_evento_chamado() TO authenticated;
GRANT ALL ON FUNCTION public.registrar_evento_chamado() TO service_role;


--
-- Name: FUNCTION usuario_por_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.usuario_por_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.usuario_por_email(p_email text) TO postgres;
GRANT ALL ON FUNCTION public.usuario_por_email(p_email text) TO service_role;


--
-- Name: FUNCTION usuarios_da_empresa(p_empresa_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.usuarios_da_empresa(p_empresa_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.usuarios_da_empresa(p_empresa_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.usuarios_da_empresa(p_empresa_id uuid) TO service_role;


--
-- Name: TABLE chamados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chamados TO postgres;
GRANT ALL ON TABLE public.chamados TO anon;
GRANT ALL ON TABLE public.chamados TO authenticated;
GRANT ALL ON TABLE public.chamados TO service_role;


--
-- Name: TABLE clientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clientes TO postgres;
GRANT ALL ON TABLE public.clientes TO anon;
GRANT ALL ON TABLE public.clientes TO authenticated;
GRANT ALL ON TABLE public.clientes TO service_role;


--
-- Name: TABLE eventos_chamado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.eventos_chamado TO postgres;
GRANT ALL ON TABLE public.eventos_chamado TO anon;
GRANT ALL ON TABLE public.eventos_chamado TO authenticated;
GRANT ALL ON TABLE public.eventos_chamado TO service_role;


--
-- Name: TABLE mensagens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mensagens TO postgres;
GRANT ALL ON TABLE public.mensagens TO anon;
GRANT ALL ON TABLE public.mensagens TO authenticated;
GRANT ALL ON TABLE public.mensagens TO service_role;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios TO postgres;
GRANT ALL ON TABLE public.usuarios TO anon;
GRANT ALL ON TABLE public.usuarios TO authenticated;
GRANT ALL ON TABLE public.usuarios TO service_role;
GRANT SELECT ON TABLE public.usuarios TO supabase_auth_admin;


--
-- Name: TABLE chamados_lista; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chamados_lista TO postgres;
GRANT ALL ON TABLE public.chamados_lista TO anon;
GRANT ALL ON TABLE public.chamados_lista TO authenticated;
GRANT ALL ON TABLE public.chamados_lista TO service_role;


--
-- Name: TABLE clientes_lista; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clientes_lista TO postgres;
GRANT ALL ON TABLE public.clientes_lista TO anon;
GRANT ALL ON TABLE public.clientes_lista TO authenticated;
GRANT ALL ON TABLE public.clientes_lista TO service_role;


--
-- Name: TABLE configuracoes_agente; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.configuracoes_agente TO postgres;
GRANT ALL ON TABLE public.configuracoes_agente TO anon;
GRANT ALL ON TABLE public.configuracoes_agente TO authenticated;
GRANT ALL ON TABLE public.configuracoes_agente TO service_role;


--
-- Name: TABLE empresas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.empresas TO postgres;
GRANT ALL ON TABLE public.empresas TO anon;
GRANT ALL ON TABLE public.empresas TO authenticated;
GRANT ALL ON TABLE public.empresas TO service_role;


--
-- Name: SEQUENCE eventos_chamado_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.eventos_chamado_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.eventos_chamado_id_seq TO anon;
GRANT ALL ON SEQUENCE public.eventos_chamado_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.eventos_chamado_id_seq TO service_role;


--
-- Name: TABLE precos_modelo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.precos_modelo TO postgres;
GRANT ALL ON TABLE public.precos_modelo TO anon;
GRANT ALL ON TABLE public.precos_modelo TO authenticated;
GRANT ALL ON TABLE public.precos_modelo TO service_role;


--
-- Name: TABLE regras_faq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.regras_faq TO postgres;
GRANT ALL ON TABLE public.regras_faq TO anon;
GRANT ALL ON TABLE public.regras_faq TO authenticated;
GRANT ALL ON TABLE public.regras_faq TO service_role;


--
-- Name: TABLE tokens_senha; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tokens_senha TO postgres;
GRANT ALL ON TABLE public.tokens_senha TO anon;
GRANT ALL ON TABLE public.tokens_senha TO authenticated;
GRANT ALL ON TABLE public.tokens_senha TO service_role;


--
-- Name: TABLE uso_llm; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.uso_llm TO postgres;
GRANT ALL ON TABLE public.uso_llm TO anon;
GRANT ALL ON TABLE public.uso_llm TO authenticated;
GRANT ALL ON TABLE public.uso_llm TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- PostgreSQL database dump complete
--

