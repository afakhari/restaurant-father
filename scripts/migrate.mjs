import fs from 'node:fs/promises';
import pg from 'pg';

const adminUrl = process.env.ADMIN_DATABASE_URL;
const appPassword = process.env.DB_APP_PASSWORD;
if (!adminUrl || !appPassword) throw new Error('ADMIN_DATABASE_URL and DB_APP_PASSWORD required');
const pool = new pg.Pool({ connectionString: adminUrl });
const qlit = (s) => `'${s.replaceAll("'", "''")}'`;
try {
  const roleExists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname='restaurant_runtime'");
  if (!roleExists.rowCount) await pool.query(`CREATE ROLE restaurant_runtime LOGIN PASSWORD ${qlit(appPassword)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
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
