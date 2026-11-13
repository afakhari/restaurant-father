-- Domain-first schema. Run as DB owner; runtime is a non-superuser with FORCE RLS.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS restaurants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 full_name text NOT NULL, password_hash text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS staff_memberships (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), user_id uuid NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK (role IN ('manager','waiter','kitchen','cashier')),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(restaurant_id,user_id)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_session_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 name text NOT NULL, address text NOT NULL DEFAULT '',
 UNIQUE(restaurant_id,id), UNIQUE(restaurant_id,name)
);
CREATE TABLE IF NOT EXISTS dining_tables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL, number integer NOT NULL CHECK(number>0), seats integer NOT NULL DEFAULT 4 CHECK(seats BETWEEN 1 AND 30),
 UNIQUE(restaurant_id,id), UNIQUE(branch_id,number),
 FOREIGN KEY(restaurant_id,branch_id) REFERENCES branches(restaurant_id,id)
);
CREATE TABLE IF NOT EXISTS menu_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 category text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
 price_toman integer NOT NULL CHECK(price_toman BETWEEN 0 AND 1000000000),
 available boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(restaurant_id,id)
);
CREATE TABLE IF NOT EXISTS table_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL, table_id uuid NOT NULL, opened_by uuid NOT NULL REFERENCES users(id),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 discount_toman integer NOT NULL DEFAULT 0 CHECK(discount_toman>=0),
 payment_method text CHECK(payment_method IN ('cash','pos','card_to_card')),
 paid_amount_toman integer CHECK(paid_amount_toman>=0),
 paid_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(restaurant_id,id),
 FOREIGN KEY(restaurant_id,branch_id) REFERENCES branches(restaurant_id,id),
 FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_table ON table_sessions(table_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_active_by_restaurant ON table_sessions(restaurant_id,branch_id,opened_at DESC) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS order_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL,
 session_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,id), UNIQUE(restaurant_id,created_by,idempotency_key),
 FOREIGN KEY(restaurant_id,session_id) REFERENCES table_sessions(restaurant_id,id)
);
CREATE TABLE IF NOT EXISTS order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL,
 round_id uuid NOT NULL, menu_item_id uuid NOT NULL, name_snapshot text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 30),
 unit_price_toman integer NOT NULL CHECK(unit_price_toman>=0),
 note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','ready','served','cancelled')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,id),
 FOREIGN KEY(restaurant_id,round_id) REFERENCES order_rounds(restaurant_id,id),
 FOREIGN KEY(restaurant_id,menu_item_id) REFERENCES menu_items(restaurant_id,id)
);
CREATE INDEX IF NOT EXISTS items_by_round ON order_items(restaurant_id,round_id);
CREATE TABLE IF NOT EXISTS order_events (
 id bigserial PRIMARY KEY, restaurant_id uuid NOT NULL,
 session_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restaurant_id,session_id) REFERENCES table_sessions(restaurant_id,id)
);
CREATE INDEX IF NOT EXISTS events_by_session ON order_events(restaurant_id,session_id,created_at DESC);

-- Authentication control-plane data is only queried by the trusted HTTP server.
-- All restaurant domain tables below are denied by default without transaction-local tenant context.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['restaurants','branches','dining_tables','menu_items','table_sessions','order_rounds','order_items','order_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',t);
  IF t='restaurants' THEN
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  ELSE
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (restaurant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (restaurant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  END IF;
 END LOOP;
END $$;
