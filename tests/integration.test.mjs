import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from '../src/server.mjs';
import {pool} from '../src/db.mjs';

let server,origin;
const creds={waiter:'waiter@narenj.demo',kitchen:'kitchen@narenj.demo',cashier:'cashier@narenj.demo',manager:'manager@narenj.demo',other:'manager@darband.demo'};
const cookies={};
before(async()=>{
 server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;process.env.PUBLIC_ORIGIN=origin;
 for(const [role,email] of Object.entries(creds)){
  const res=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email,password:process.env.DEMO_PASSWORD??'Demo-Shift-1405!'})});
  assert.equal(res.status,200,`${email} login failed`);cookies[role]=res.headers.get('set-cookie').split(';')[0];
 }
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();});
async function request(role,method,url,body){const res=await fetch(`${origin}${url}`,{method,headers:{origin,'content-type':'application/json',cookie:cookies[role]},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};}
const shift=role=>request(role,'GET','/api/shift');
const findTable=(data,number)=>{const firstBranch=data.branches[0].id;return data.tables.find(x=>x.number===number&&x.branch_id===firstBranch);};
const sessionFor=(data,tableId)=>data.sessions.find(s=>s.table_id===tableId&&!s.closed_at);
const roundIds=(data,sessionId)=>data.rounds.filter(r=>r.session_id===sessionId).map(r=>r.id);
const itemsFor=(data,sessionId)=>data.items.filter(i=>roundIds(data,sessionId).includes(i.round_id));

test('tenant A and tenant B read only their restaurant records; RLS denies unscoped connection',async()=>{
 const A=(await shift('waiter')).body,B=(await shift('other')).body;
 assert.equal(A.restaurant.slug,'narenj');assert.equal(B.restaurant.slug,'darband');
 assert.notEqual(A.restaurant.id,B.restaurant.id);
 assert.ok(A.menu.some(x=>x.name==='چلوکباب کوبیده'));
 assert.ok(!B.menu.some(x=>x.name==='چلوکباب کوبیده'));
 assert.ok(B.menu.some(x=>x.name==='کباب برگ'));
 const direct=await pool.query('SELECT count(*)::int AS count FROM dining_tables');
 assert.equal(direct.rows[0].count,0,'unscoped SQL must see no tenant domain rows');
 const foreignId=A.sessions.find(s=>!s.closed_at).id;
 const bad=await request('other','POST',`/api/sessions/${foreignId}/checkout`,{expectedVersion:1,method:'pos'});
 assert.equal(bad.status,404);
});

test('role boundary: kitchen cannot post rounds and waiter cannot settle bill',async()=>{
 const A=(await shift('waiter')).body;const t=A.tables.find(x=>sessionFor(A,x.id));const s=sessionFor(A,t.id);
 const role=await request('kitchen','POST','/api/rounds',{tableId:t.id,expectedSessionId:s.id,idempotencyKey:crypto.randomUUID(),items:[{menuItemId:A.menu[0].id,quantity:1,note:''}]});
 assert.equal(role.status,403);
 const bill=await request('waiter','POST',`/api/sessions/${s.id}/checkout`,{expectedVersion:s.version,method:'cash'});
 assert.equal(bill.status,403);
});

test('parallel round additions survive, retries are idempotent, tenant cannot alter the items',async()=>{
 const A=(await shift('waiter')).body;
 const t=A.tables.find(x=>x.number===3&&sessionFor(A,x.id));const s=sessionFor(A,t.id);assert.ok(s);
 const drinks=A.menu.find(x=>x.name==='لیموناد'),food=A.menu.find(x=>x.name==='میرزاقاسمی');
 const keyA=crypto.randomUUID(),keyB=crypto.randomUUID();
 const payloadA={tableId:t.id,expectedSessionId:s.id,idempotencyKey:keyA,items:[{menuItemId:drinks.id,quantity:1,note:''}]};
 const payloadB={tableId:t.id,expectedSessionId:s.id,idempotencyKey:keyB,items:[{menuItemId:food.id,quantity:2,note:'بدون سیر'}]};
 const [a,b]=await Promise.all([request('waiter','POST','/api/rounds',payloadA),request('waiter','POST','/api/rounds',payloadB)]);
 assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.roundId,b.body.roundId);
 const replay=await request('waiter','POST','/api/rounds',payloadA);
 assert.equal(replay.status,201);assert.equal(replay.body.replayed,true);assert.equal(replay.body.roundId,a.body.roundId);
 const updated=(await shift('waiter')).body;const ids=itemsFor(updated,s.id);
 assert.equal(ids.filter(x=>x.round_id===a.body.roundId).length,1);
 assert.equal(ids.filter(x=>x.round_id===b.body.roundId).length,1);
 const foreign=await request('other','POST',`/api/items/${ids[0].id}/transition`,{expectedStatus:ids[0].status,to:'preparing'});
 assert.equal(foreign.status,404);
});

test('complete user workflow: waiter -> kitchen -> waiter serves -> cashier discounts and checks out',async()=>{
 const A=(await shift('waiter')).body;
 const t=A.tables.find(x=>x.number===8&&!sessionFor(A,x.id)&&A.branches.some(b=>b.id===x.branch_id));assert.ok(t,'need free seeded table 8');
 const menu=A.menu.find(x=>x.name==='چای زعفرانی');
 const r=await request('waiter','POST','/api/rounds',{tableId:t.id,expectedSessionId:null,idempotencyKey:crypto.randomUUID(),items:[{menuItemId:menu.id,quantity:2,note:'یکی کم‌رنگ'}]});
 assert.equal(r.status,201);
 let snap=(await shift('waiter')).body;let session=sessionFor(snap,t.id);assert.ok(session);
 let line=itemsFor(snap,session.id)[0];assert.equal(line.unit_price_toman,menu.price_toman);
 const early=await request('cashier','POST',`/api/sessions/${session.id}/checkout`,{expectedVersion:session.version,method:'cash'});assert.equal(early.status,409);
 const prep=await request('kitchen','POST',`/api/items/${line.id}/transition`,{expectedStatus:'queued',to:'preparing'});assert.equal(prep.status,200);
 const ready=await request('kitchen','POST',`/api/items/${line.id}/transition`,{expectedStatus:'preparing',to:'ready'});assert.equal(ready.status,200);
 const served=await request('waiter','POST',`/api/items/${line.id}/transition`,{expectedStatus:'ready',to:'served'});assert.equal(served.status,200);
 snap=(await shift('cashier')).body;session=sessionFor(snap,t.id);
 const discount=await request('cashier','POST',`/api/sessions/${session.id}/discount`,{amountToman:10000,expectedVersion:session.version});assert.equal(discount.status,200);
 snap=(await shift('cashier')).body;session=sessionFor(snap,t.id);
 const paid=await request('cashier','POST',`/api/sessions/${session.id}/checkout`,{method:'pos',expectedVersion:session.version});
 assert.equal(paid.status,200);assert.equal(paid.body.total,menu.price_toman*2-10000);
 snap=(await shift('waiter')).body;assert.ok(!sessionFor(snap,t.id));
 assert.ok(snap.events.some(x=>x.session_id===session.id&&x.event_type==='session.checked_out'));
});

test('CSRF origin mismatch fails closed',async()=>{
 const response=await fetch(`${origin}/api/rounds`,{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json',cookie:cookies.waiter},body:'{}'});
 assert.equal(response.status,403);
});
