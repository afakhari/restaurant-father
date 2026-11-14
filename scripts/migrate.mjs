import fs from 'node:fs/promises';
import pg from 'pg';

const adminUrl = process.env.ADMIN_DATABASE_URL;
const appPassword = process.env.DB_APP_PASSWORD;
if (!adminUrl || !appPassword) throw new Error('ADMIN_DATABASE_URL and DB_APP_PASSWORD required');
const pool = new pg.Pool({ connectionString: adminUrl });
const qlit = (s) => `'${s.replaceAll("'", "''")}'`;
try {
  // An ordinary SQL-created role defaults to NO SUPERUSER, NO BYPASSRLS,
  // NO CREATEDB and NO CREATEROLE. Explicit negative superuser attributes may
  // be disallowed for delegated CREATEROLE users on managed Postgres (Neon).
  const role = await pool.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='restaurant_runtime'");
  if (role.rowCount && Object.values(role.rows[0]).some(Boolean))
    throw new Error('Existing restaurant_runtime role is privileged; refusing to use it for the public app');
  if (!role.rowCount) await pool.query(`CREATE ROLE restaurant_runtime LOGIN PASSWORD ${qlit(appPassword)}`);
  else await pool.query(`ALTER ROLE restaurant_runtime PASSWORD ${qlit(appPassword)}`);
  const migration = await fs.readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(`GRANT USAGE ON SCHEMA public TO restaurant_runtime;
    GRANT SELECT ON users, staff_memberships TO restaurant_runtime;
    GRANT SELECT, INSERT, DELETE ON auth_sessions TO restaurant_runtime;
    GRANT SELECT ON restaurants, branches, dining_tables, menu_items TO restaurant_runtime;
    GRANT SELECT, INSERT, UPDATE ON table_sessions, order_items TO restaurant_runtime;
    GRANT SELECT, INSERT ON order_rounds, order_events TO restaurant_runtime;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO restaurant_runtime;`);
  console.log(JSON.stringify({level:'info',event:'migrations_complete'}));
} finally { await pool.end(); }
