import pg from 'pg';
import {HttpError,requiredRole} from './core.mjs';
const conn=process.env.DATABASE_URL;
if(!conn)throw new Error('DATABASE_URL is required');
export const pool=new pg.Pool({connectionString:conn,max:12,connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
export async function withTenant(user,fn){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[user.restaurantId]);
    const value=await fn(client);
    await client.query('COMMIT');
    return value;
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e;}finally{client.release();}
}
export async function requireSession(client,id,{lock=false}={}){
  const s=await client.query(`SELECT * FROM table_sessions WHERE id=$1 ${lock?'FOR UPDATE':''}`,[id]);
  if(!s.rowCount)throw new HttpError(404,'NOT_FOUND','نشست میز پیدا نشد.');
  return s.rows[0];
}
export async function lockTable(client,tableId){
  // Advisory transaction lock serializes writers without granting UPDATE on table definitions.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',[tableId]);
  const t=await client.query('SELECT * FROM dining_tables WHERE id=$1',[tableId]);
  if(!t.rowCount)throw new HttpError(404,'NOT_FOUND','میز پیدا نشد.');
  return t.rows[0];
}
export async function getSessionItems(client,sessionId){
  const {rows}=await client.query(`SELECT oi.* FROM order_items oi JOIN order_rounds r ON r.id=oi.round_id AND r.restaurant_id=oi.restaurant_id WHERE r.session_id=$1`,[sessionId]);
  return rows;
}
export async function logEvent(client,user,sessionId,eventType,payload={}){
  await client.query('INSERT INTO order_events(restaurant_id,session_id,actor_id,event_type,payload) VALUES($1,$2,$3,$4,$5)',[user.restaurantId,sessionId,user.id,eventType,JSON.stringify(payload)]);
}
export async function shiftSnapshot(user){return withTenant(user,async client=>{
 const [rests,branches,tables,menu,sessions,rounds,items,events]=await Promise.all([
   client.query('SELECT id,name,slug FROM restaurants'),
   client.query('SELECT id,restaurant_id,name,address FROM branches ORDER BY name'),
   client.query('SELECT id,restaurant_id,branch_id,number,seats FROM dining_tables ORDER BY number'),
   client.query('SELECT id,category,name,description,price_toman,available FROM menu_items ORDER BY sort_order,name'),
   client.query('SELECT * FROM table_sessions ORDER BY opened_at DESC LIMIT 75'),
   client.query('SELECT id,session_id,created_by,created_at FROM order_rounds ORDER BY created_at DESC LIMIT 250'),
   client.query(`SELECT oi.id,oi.round_id,oi.menu_item_id,oi.name_snapshot,oi.quantity,oi.unit_price_toman,oi.note,oi.status,oi.updated_at FROM order_items oi ORDER BY oi.updated_at DESC LIMIT 1000`),
   client.query('SELECT id,session_id,event_type,payload,created_at FROM order_events ORDER BY created_at DESC LIMIT 60')
 ]);
 return {restaurant:rests.rows[0]??null,branches:branches.rows,tables:tables.rows,menu:menu.rows,sessions:sessions.rows,rounds:rounds.rows,items:items.rows,events:events.rows,me:{id:user.id,name:user.name,role:user.role,restaurantId:user.restaurantId}};
 });}
