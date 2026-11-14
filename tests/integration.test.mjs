import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {createServer} from '../src/server.mjs';
import {pool,withTenant} from '../src/db.mjs';

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
 const editedQuantity=await request('waiter','POST','/api/rounds',{...payloadA,items:[{...payloadA.items[0],quantity:2}]});
 assert.equal(editedQuantity.status,409,'same retry key with changed quantity cannot claim a successful save');
 assert.equal(editedQuantity.body.error.code,'IDEMPOTENCY_CONFLICT');
 const editedNote=await request('waiter','POST','/api/rounds',{...payloadA,items:[{...payloadA.items[0],note:'بدون یخ'}]});
 assert.equal(editedNote.status,409,'same retry key with changed note cannot lose a preparation instruction');
 const replayPrice=await request('waiter','POST','/api/rounds',{...payloadA,items:[{...payloadA.items[0],expectedPriceToman:Number(drinks.price_toman)}]});
 assert.equal(replayPrice.status,201,'correct expected historical price should be replayable');
 assert.equal(replayPrice.body.replayed,true);
 const wrongPriceReplay=await request('waiter','POST','/api/rounds',{...payloadA,items:[{...payloadA.items[0],expectedPriceToman:Number(drinks.price_toman)+1000}]});
 assert.equal(wrongPriceReplay.status,409,'a changed expected price must not succeed as a replay');
 assert.equal(wrongPriceReplay.body.error.code,'IDEMPOTENCY_CONFLICT');
 // Reusing the same idempotency key on a different table must NOT silently return the old round.
 const otherTable=A.tables.find(x=>x.id!==t.id);
 const wrongTable=await request('waiter','POST','/api/rounds',{...payloadA,tableId:otherTable.id,expectedSessionId:null});
 assert.equal(wrongTable.status,409);
 // A simultaneous retry of the same key must produce one round, not a unique-constraint 500.
 const retryKey=crypto.randomUUID();
 const dup={...payloadB,idempotencyKey:retryKey};
 const [firstRetry,secondRetry]=await Promise.all([request('waiter','POST','/api/rounds',dup),request('waiter','POST','/api/rounds',dup)]);
 assert.equal(firstRetry.status,201);assert.equal(secondRetry.status,201);
 assert.equal(firstRetry.body.roundId,secondRetry.body.roundId);
 assert.equal([firstRetry.body.replayed,secondRetry.body.replayed].filter(Boolean).length,1);
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
 const managerSnapshot=(await shift('manager')).body;
 assert.ok(managerSnapshot.events.some(x=>x.session_id===session.id&&x.event_type==='session.checked_out'));
 assert.equal(snap.events.length,0,'waiter may not receive manager audit events');
});

test('CSRF origin mismatch fails closed',async()=>{
 const response=await fetch(`${origin}/api/rounds`,{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json',cookie:cookies.waiter},body:'{}'});
 assert.equal(response.status,403);
});


test('login endpoint throttles repeated attempts without exposing account existence',async()=>{
 const email='no-such-person@example.invalid';
 for(let i=0;i<8;i++){
  const r=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password:'incorrect'})});
  assert.equal(r.status,401);
 }
 const blocked=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password:'incorrect'})});
 assert.equal(blocked.status,429);
});

test('AI endpoint fails visibly when provider is not configured, without blocking manual order entry',async()=>{
 const before=process.env.AI_API_URL;const key=process.env.AI_API_KEY;const model=process.env.AI_MODEL;
 delete process.env.AI_API_URL;delete process.env.AI_API_KEY;delete process.env.AI_MODEL;
 try{
  const result=await request('waiter','POST','/api/ai/parse',{note:'دو عدد لاته و یک آب معدنی'});
  assert.equal(result.status,503);assert.equal(result.body.error.code,'AI_UNAVAILABLE');
  const data=await shift('waiter');assert.equal(data.status,200);
 }finally{
  if(before!==undefined)process.env.AI_API_URL=before;
  if(key!==undefined)process.env.AI_API_KEY=key;
  if(model!==undefined)process.env.AI_MODEL=model;
 }
});

test('AI response is constrained to current restaurant menu and requires staff confirmation',async()=>{
 const menu=(await shift('waiter')).body.menu;
 const available=menu.find(x=>x.available);
 const remote=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[
   {menuItemId:available.id,quantity:2,note:'یکی کم‌شیر'},
   {menuItemId:crypto.randomUUID(),quantity:1,note:'غذای خارجی'}
  ],unmatched:'نامشخص'})}}]}));
 });
 await new Promise(resolve=>remote.listen(0,'127.0.0.1',resolve));
 const saved=[process.env.AI_API_URL,process.env.AI_API_KEY,process.env.AI_MODEL];
 process.env.AI_API_URL=`http://127.0.0.1:${remote.address().port}`;
 process.env.AI_API_KEY='test-key';process.env.AI_MODEL='fake-test-only';
 try{
  const r=await request('waiter','POST','/api/ai/parse',{note:'دو تا غذا از منو یکی کم‌شیر'});
  assert.equal(r.status,200);assert.equal(r.body.requiresConfirmation,true);
  assert.deepEqual(r.body.items,[{menuItemId:available.id,quantity:2,note:'یکی کم‌شیر'}]);
  assert.equal(r.body.unmatched,'نامشخص');
 }finally{
  [process.env.AI_API_URL,process.env.AI_API_KEY,process.env.AI_MODEL]=saved;
  for(const name of ['AI_API_URL','AI_API_KEY','AI_MODEL'])if(process.env[name]==='undefined')delete process.env[name];
  await new Promise(resolve=>remote.close(resolve));
 }
});



test('new order suggestions stay bound to table, tenant and role and never write rounds',async()=>{
 const saved=[process.env.AI_API_URL,process.env.AI_API_KEY,process.env.AI_MODEL];
 delete process.env.AI_API_URL;delete process.env.AI_API_KEY;delete process.env.AI_MODEL;
 try{
  const before=(await shift('waiter')).body;
  const table=before.tables.find(t=>t.number===3&&sessionFor(before,t.id));
  assert.ok(table);
  const session=sessionFor(before,table.id);
  const payload={tableId:table.id,expectedSessionId:session.id,clientRequestId:crypto.randomUUID(),sourceRevision:3,note:'دو لاته، یکی کم‌شیر'};
  const result=await request('waiter','POST','/api/ai/order-suggestions',payload);
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.source,'rules');
  assert.equal(result.body.requiresConfirmation,true);
  assert.equal(result.body.context.tableId,table.id);
  assert.equal(result.body.context.sessionId,session.id);
  assert.equal(result.body.context.sourceRevision,3);
  assert.equal(result.body.items.length,2);
  assert.equal(result.body.items.reduce((sum,i)=>sum+i.quantity,0),2);
  assert.equal(result.body.items.filter(i=>i.note).length,1);
  const after=(await shift('waiter')).body;
  assert.equal(after.rounds.length,before.rounds.length,'suggestion must not write orders');
  assert.equal((await request('kitchen','POST','/api/ai/order-suggestions',payload)).status,403);
  assert.equal((await request('other','POST','/api/ai/order-suggestions',payload)).status,404);
  assert.equal((await request('waiter','POST','/api/ai/order-suggestions',{...payload,expectedSessionId:null})).status,409);
  const invalid=await request('waiter','POST','/api/ai/order-suggestions',{...payload,note:'شماره 09121234567 را ذخیره کن'});
  assert.equal(invalid.status,422);
 }finally{
  for(const [name,value] of [['AI_API_URL',saved[0]],['AI_API_KEY',saved[1]],['AI_MODEL',saved[2]]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});

test('suggestion kill switch returns a clear error without disabling manual workflow',async()=>{
 const prior=process.env.AI_ORDER_ENABLED;process.env.AI_ORDER_ENABLED='false';
 try{
  const current=(await shift('waiter')).body;
  const table=current.tables.find(t=>t.number===3&&sessionFor(current,t.id));
  const session=sessionFor(current,table.id);
  const r=await request('waiter','POST','/api/ai/order-suggestions',{
   tableId:table.id,expectedSessionId:session.id,clientRequestId:crypto.randomUUID(),sourceRevision:1,note:'دو عدد لاته'
  });
  assert.equal(r.status,503);assert.equal(r.body.error.code,'ORDER_SUGGESTIONS_DISABLED');
  assert.equal((await request('waiter','GET','/api/me')).body.features.orderSuggestionsEnabled,false);
  assert.equal((await shift('waiter')).status,200);
 }finally{if(prior===undefined)delete process.env.AI_ORDER_ENABLED;else process.env.AI_ORDER_ENABLED=prior;}
});

test('natural-language suggestions report invalid provider IDs instead of inserting them',async()=>{
 const before=(await shift('waiter')).body;
 const table=before.tables.find(t=>t.number===3&&sessionFor(before,t.id)),session=sessionFor(before,table.id);
 const menuItem=before.menu.find(m=>m.available&&m.name==='لاته');
 const remote=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[
   {menuItemId:menuItem.id,quantity:1,note:'کم‌شیر',sourceText:'یک لاته کم‌شیر'},
   {menuItemId:crypto.randomUUID(),quantity:1,note:'',sourceText:'غذای ساختگی'},
   {menuItemId:menuItem.id,quantity:99,note:'',sourceText:'نودونه لاته'}
  ],unmatched:'نوشابه'})}}]}));
 });
 await new Promise(resolve=>remote.listen(0,'127.0.0.1',resolve));
 const saved=[process.env.AI_API_URL,process.env.AI_API_KEY,process.env.AI_MODEL,process.env.NODE_ENV];
 process.env.AI_API_URL='http://127.0.0.1:'+remote.address().port;
 process.env.AI_API_KEY='local-mock-only';process.env.AI_MODEL='local-test';process.env.NODE_ENV='test';
 try{
  const result=await request('waiter','POST','/api/ai/order-suggestions',{tableId:table.id,expectedSessionId:session.id,clientRequestId:crypto.randomUUID(),sourceRevision:1,note:'یک لاته کم‌شیر و نوشابه'});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.source,'ai');
  assert.equal(result.body.items.length,1);
  assert.equal(result.body.unresolved.length,3);
  assert.equal(result.body.requiresConfirmation,true);
  assert.ok(result.body.context.menuFingerprint);
  assert.equal((await shift('waiter')).body.rounds.length,before.rounds.length);
 }finally{
  [process.env.AI_API_URL,process.env.AI_API_KEY,process.env.AI_MODEL,process.env.NODE_ENV]=saved;
  for(const name of ['AI_API_URL','AI_API_KEY','AI_MODEL','NODE_ENV'])if(process.env[name]===undefined||process.env[name]==='undefined')delete process.env[name];
  await new Promise(resolve=>remote.close(resolve));
 }
});

test('prices changed since preview are rejected before any round is written',async()=>{
 const before=(await shift('waiter')).body,table=before.tables.find(t=>t.number===3&&sessionFor(before,t.id));
 const session=sessionFor(before,table.id),item=before.menu.find(m=>m.available);
 const count=before.rounds.length;
 const result=await request('waiter','POST','/api/rounds',{tableId:table.id,expectedSessionId:session.id,idempotencyKey:crypto.randomUUID(),items:[{menuItemId:item.id,quantity:1,note:'',expectedPriceToman:Number(item.price_toman)+1}]});
 assert.equal(result.status,409);
 assert.equal(result.body.error.code,'MENU_PRICE_CHANGED');
 assert.equal((await shift('waiter')).body.rounds.length,count);
});

test('busy historical traffic never removes an older open table from the live shift snapshot',async()=>{
 const original=(await shift('waiter')).body;
 const active=original.sessions.find(x=>!x.closed_at);assert.ok(active);
 const actor={id:original.me.id,restaurantId:original.me.restaurantId,role:original.me.role};
 await withTenant(actor,client=>client.query(`INSERT INTO table_sessions(restaurant_id,branch_id,table_id,opened_by,opened_at,closed_at)
   SELECT $1,$2,$3,$4,now()-interval '2 hour',now() FROM generate_series(1,85)`,
   [actor.restaurantId,active.branch_id,active.table_id,actor.id]));
 const after=(await shift('waiter')).body;
 const retained=after.sessions.find(x=>x.id===active.id);
 assert.ok(retained&&!retained.closed_at,'an older open session must remain visible');
 assert.ok(after.rounds.some(x=>x.session_id===active.id),'active rounds must remain loaded');
 assert.ok(after.items.some(x=>after.rounds.some(r=>r.session_id===active.id&&r.id===x.round_id)),'active order items must remain loaded');
 assert.ok(after.sessions.filter(x=>x.closed_at).length<=20,'closed history must be bounded independently');
});


test('role-specific shift responses never expose checkout money to kitchen or manager audits to staff',async()=>{
 const kitchen=(await shift('kitchen')).body,waiter=(await shift('waiter')).body,cashier=(await shift('cashier')).body,manager=(await shift('manager')).body;
 assert.ok(kitchen.sessions.length,'kitchen must still receive the active shift');
 assert.ok(kitchen.items.length,'kitchen needs ticket detail');
 assert.ok(!('unit_price_toman' in kitchen.items[0]),'kitchen should not receive item prices');
 assert.ok(!('discount_toman' in kitchen.sessions[0]),'kitchen should not receive discounts');
 assert.ok(!('payment_method' in kitchen.sessions[0]),'kitchen should not receive payment details');
 assert.ok(!('price_toman' in kitchen.menu[0]),'kitchen needs dish category, not prices');
 assert.deepEqual(kitchen.events,[]);
 assert.deepEqual(waiter.events,[]);
 assert.ok(waiter.sessions.every(s=>!s.closed_at),'waiter should not receive past closed receipts');
 assert.ok(!('paid_amount_toman' in waiter.sessions[0]));
 assert.deepEqual(cashier.menu,[],'cashier does not need full menu feed');
 assert.deepEqual(cashier.events,[],'cashier should not receive manager audit');
 assert.ok(manager.events.length>0,'manager retains audit visibility');
 assert.ok(manager.items.some(i=>typeof i.unit_price_toman==='number'),'manager retains price visibility');
});

test('manager can resolve stockout, but only fully cancelled tables can be voided without fake payment',async()=>{
 const snap=(await shift('waiter')).body;
 const t=snap.tables.find(t=>t.number===7&&!sessionFor(snap,t.id));assert.ok(t,'seed table 7 should be free');
 const dishes=snap.menu.filter(m=>m.available).slice(0,3);assert.equal(dishes.length,3);
 const created=await request('waiter','POST','/api/rounds',{tableId:t.id,expectedSessionId:null,idempotencyKey:crypto.randomUUID(),items:dishes.map((dish,i)=>({menuItemId:dish.id,quantity:1,note:i===1?'بدون پیاز':''}))});
 assert.equal(created.status,201);
 let cur=(await shift('manager')).body,session=sessionFor(cur,t.id),items=itemsFor(cur,session.id);assert.equal(items.length,3);
 assert.equal((await request('cashier','POST',`/api/sessions/${session.id}/void`,{expectedVersion:session.version,reason:'سفارش لغو شد'})).status,403);
 assert.equal((await request('manager','POST',`/api/sessions/${session.id}/void`,{expectedVersion:session.version,reason:'سفارش لغو شد'})).status,409);
 const first=items[0],second=items[1],third=items[2];
 assert.equal((await request('kitchen','POST',`/api/items/${second.id}/transition`,{to:'preparing',expectedStatus:'queued'})).status,200);
 assert.equal((await request('kitchen','POST',`/api/items/${third.id}/transition`,{to:'preparing',expectedStatus:'queued'})).status,200);
 assert.equal((await request('kitchen','POST',`/api/items/${third.id}/transition`,{to:'ready',expectedStatus:'preparing'})).status,200);
 assert.equal((await request('waiter','POST',`/api/items/${second.id}/transition`,{to:'cancelled',expectedStatus:'preparing',reason:'ناموجود'})).status,403);
 assert.equal((await request('kitchen','POST',`/api/items/${third.id}/transition`,{to:'cancelled',expectedStatus:'ready',reason:'کیفیت پایین'})).status,403);
 assert.equal((await request('manager','POST',`/api/items/${first.id}/transition`,{to:'cancelled',expectedStatus:'queued',reason:'مشتری انصراف داد'})).status,200);
 assert.equal((await request('manager','POST',`/api/items/${second.id}/transition`,{to:'cancelled',expectedStatus:'preparing',reason:'ماده اولیه تمام شد'})).status,200);
 assert.equal((await request('manager','POST',`/api/items/${third.id}/transition`,{to:'cancelled',expectedStatus:'ready',reason:'اشکال کیفیت'})).status,200);
 cur=(await shift('manager')).body;session=sessionFor(cur,t.id);
 assert.equal((await request('manager','POST',`/api/sessions/${session.id}/checkout`,{expectedVersion:session.version,method:'pos'})).status,409,'all cancelled is not a paid receipt');
 assert.equal((await request('manager','POST',`/api/sessions/${session.id}/void`,{expectedVersion:session.version,reason:' ' })).status,400);
 assert.equal((await request('manager','POST',`/api/sessions/${session.id}/void`,{expectedVersion:session.version-1,reason:'همه اقلام لغو شده' })).status,409);
 const done=await request('manager','POST',`/api/sessions/${session.id}/void`,{expectedVersion:session.version,reason:'همه اقلام لغو شده‌اند'});
 assert.equal(done.status,200);assert.equal(done.body.voided,true);
 cur=(await shift('manager')).body;assert.ok(!sessionFor(cur,t.id));
 const closed=cur.sessions.find(x=>x.id===session.id);assert.ok(closed.closed_at);assert.equal(closed.paid_amount_toman,null);assert.equal(closed.payment_method,null);
 assert.ok(cur.events.some(x=>x.event_type==='session.voided'&&x.session_id===session.id));
 assert.equal((await request('manager','POST',`/api/sessions/${session.id}/void`,{expectedVersion:closed.version,reason:'تکراری'})).status,409);
});
