-- Faza Studio Database Schema — Migration 025
-- Idempotency per webhook Midtrans.
-- ============================================================
-- MASALAH (audit R-03): webhook payment senza idempotency. Un retry/duplicato
-- Midtrans ricrea la riga user_usage e RESETTA credits_used=0 -> possibili
-- doppi crediti o reset accidentali dei crediti usati.
--
-- SOLUZIONE: tabella processed_webhooks + funzione ATOMICA claim_webhook().
--   - INSERT ... ON CONFLICT DO NOTHING: solo il primo chiamante "vince".
--   - `return found;` -> TRUE se la riga e' stata appena inserita (prima volta),
--     FALSE se esisteva gia' (duplicato/replay). Un webhook richiamato di
--     nuovo su un ordine gia' processato NON applica il piano -> NON resetta
--     credits_used.

create table if not exists processed_webhooks (
  order_id text primary key,
  processed_at timestamptz not null default now()
);

create or replace function claim_webhook(p_order_id text)
returns boolean
language plpgsql
as $$
begin
  insert into processed_webhooks (order_id)
  values (p_order_id)
  on conflict (order_id) do nothing;

  -- "found" e' TRUE se una riga e' stata inserita, FALSE se l'azione e' stata saltata.
  return found;
end;
$$;

-- Sicurezza: tabella e funzione devono essere raggiungibili SOLO da
-- service_role (back-end webhook). Niente accesso per anon/authenticated.
alter table processed_webhooks enable row level security;
alter table processed_webhooks force row level security;

revoke execute on function claim_webhook(text) from public, anon, authenticated;
grant execute on function claim_webhook(text) to service_role;