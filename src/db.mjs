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
// Return *all* open sessions and their complete rounds/items. Historical data is
// bounded separately; a global newest-N LIMIT must not hide older open tickets.
export async function shiftSnapshot(user){return withTenant(user,async client=>{
 const [rests,branches,tables,menu,open,history]=await Promise.all([
   client.query('SELECT id,name,slug FROM restaurants'),
   client.query('SELECT id,restaurant_id,name,address FROM branches ORDER BY name'),
   client.query('SELECT id,restaurant_id,branch_id,number,seats FROM dining_tables ORDER BY number'),
   client.query('SELECT id,category,name,description,price_toman,available FROM menu_items ORDER BY sort_order,name'),
   client.query('SELECT * FROM table_sessions WHERE closed_at IS NULL ORDER BY opened_at ASC'),
   client.query('SELECT * FROM table_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20')
 ]);
 const sessions=[...open.rows,...history.rows],sessionIds=sessions.map(x=>x.id);
 const [rounds,items,events]=await Promise.all([
   client.query('SELECT id,session_id,created_by,created_at FROM order_rounds WHERE session_id=ANY($1::uuid[]) ORDER BY created_at DESC',[sessionIds]),
   client.query(`SELECT oi.id,oi.round_id,oi.menu_item_id,oi.name_snapshot,oi.quantity,oi.unit_price_toman,oi.note,oi.status,oi.updated_at
     FROM order_items oi JOIN order_rounds r ON r.id=oi.round_id AND r.restaurant_id=oi.restaurant_id
     WHERE r.session_id=ANY($1::uuid[]) ORDER BY oi.updated_at DESC`,[sessionIds]),
   client.query('SELECT id,session_id,event_type,payload,created_at FROM order_events ORDER BY created_at DESC LIMIT 60')
 ]);
 // Present only the data each authenticated employee needs. Hiding UI tabs alone
 // never protects prices, cashier payment records or manager audit trails.
 const role=user.role;
 const visibleSessions=(role==='manager'||role==='cashier')?sessions:open.rows;
 const permitted=new Set(visibleSessions.map(s=>s.id));
 const safeRounds=rounds.rows.filter(r=>permitted.has(r.session_id));
 const allowedRounds=new Set(safeRounds.map(r=>r.id));
 const safeItems=items.rows.filter(i=>allowedRounds.has(i.round_id));
 const projectedSessions=(role==='manager'||role==='cashier')?visibleSessions:visibleSessions.map(s=>({id:s.id,branch_id:s.branch_id,table_id:s.table_id,opened_at:s.opened_at,closed_at:s.closed_at,...(role==='waiter'?{discount_toman:s.discount_toman}: {})}));
 const projectedItems=role==='kitchen'?safeItems.map(i=>({id:i.id,round_id:i.round_id,menu_item_id:i.menu_item_id,name_snapshot:i.name_snapshot,quantity:i.quantity,note:i.note,status:i.status,updated_at:i.updated_at})):safeItems;
 const projectedMenu=role==='cashier'?[]:role==='kitchen'?menu.rows.map(m=>({id:m.id,category:m.category,name:m.name,available:m.available})):menu.rows;
 const projectedRounds=role==='kitchen'?safeRounds.map(r=>({id:r.id,session_id:r.session_id,created_at:r.created_at})):safeRounds;
 return {restaurant:rests.rows[0]??null,branches:branches.rows,tables:tables.rows,menu:projectedMenu,sessions:projectedSessions,rounds:projectedRounds,items:projectedItems,events:role==='manager'?events.rows:[],me:{id:user.id,name:user.name,role:user.role,restaurantId:user.restaurantId}};
 });}
