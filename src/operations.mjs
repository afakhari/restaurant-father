import {randomUUID} from 'node:crypto';
import {HttpError,requireInt,requireUuid,requiredRole,nextItemStatus,parseRound,paymentMethods,sumSubtotal,canCheckout,canVoidSession} from './core.mjs';
import {withTenant,requireSession,lockTable,getSessionItems,logEvent} from './db.mjs';

// Idempotency is a *request* identity, not a license to silently accept edited
// contents. A replay must match the same table AND every individual item/note.
async function verifiedRoundReplay(client,row,body){
 if(row.table_id!==body.tableId)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','این شناسه سفارش قبلاً برای میز دیگری استفاده شده است.');
 const result=await client.query('SELECT menu_item_id,quantity,note,unit_price_toman FROM order_items WHERE round_id=$1',[row.id]);
 const normalize=items=>items.map(x=>JSON.stringify([x.menuItemId??x.menu_item_id,Number(x.quantity),String(x.note??'').trim()])).sort();
 if(JSON.stringify(normalize(result.rows))!==JSON.stringify(normalize(body.items))){
  throw new HttpError(409,'IDEMPOTENCY_CONFLICT','این درخواست قبلاً با اقلام یا توضیحات متفاوت ثبت شده است. سفارش جاری را بررسی کنید و درخواست تازه‌ای ثبت کنید.');
 }
 // When a delayed client retry adds or changes its price expectation, it must
 // not mistake a historical charge for a freshly approved price.
 const prices=new Map(result.rows.map(x=>[x.menu_item_id,Number(x.unit_price_toman)]));
 if(body.items.some(x=>x.expectedPriceToman!==undefined&&prices.get(x.menuItemId)!==x.expectedPriceToman)){
  throw new HttpError(409,'IDEMPOTENCY_CONFLICT','مبلغ مورد انتظار با سفارش ثبت‌شده قبلی سازگار نیست. صورت‌حساب میز را بررسی کنید.');
 }
 return {roundId:row.id,sessionId:row.session_id,replayed:true};
}

export async function addRound(user,raw){
 requiredRole(user,['waiter','manager']);const body=parseRound(raw);
 return withTenant(user,async client=>{
   // Same key already completed: returning it is safe even if the table was checked out since.
   let previous=await client.query('SELECT r.id,r.session_id,s.table_id FROM order_rounds r JOIN table_sessions s ON s.id=r.session_id WHERE r.created_by=$1 AND r.idempotency_key=$2',[user.id,body.idempotencyKey]);
   if(previous.rowCount)return verifiedRoundReplay(client,previous.rows[0],body);
   const table=await lockTable(client,body.tableId);
   // Recheck after serializing on the table to handle simultaneous retries of the same key.
   previous=await client.query('SELECT r.id,r.session_id,s.table_id FROM order_rounds r JOIN table_sessions s ON s.id=r.session_id WHERE r.created_by=$1 AND r.idempotency_key=$2',[user.id,body.idempotencyKey]);
   if(previous.rowCount)return verifiedRoundReplay(client,previous.rows[0],body);
   const existing=await client.query('SELECT id FROM table_sessions WHERE table_id=$1 AND closed_at IS NULL FOR UPDATE',[table.id]);
   const sessionId=existing.rows[0]?.id??null;
   if(body.expectedSessionId!==sessionId)throw new HttpError(409,'STALE_SESSION','وضعیت میز تغییر کرده است. صفحه را تازه کنید.');
   if(sessionId){await client.query('SELECT id FROM table_sessions WHERE id=$1 FOR UPDATE',[sessionId]);}
   const ids=[...new Set(body.items.map(x=>x.menuItemId))];
   const menu=await client.query('SELECT id,name,price_toman,available FROM menu_items WHERE id=ANY($1::uuid[])',[ids]);
   const byId=new Map(menu.rows.map(x=>[x.id,x]));
   if(ids.some(id=>!byId.get(id)?.available))throw new HttpError(409,'MENU_CHANGED','یک یا چند غذا ناموجود یا خارج از منوی رستوران است.');
   if(body.items.some(x=>x.expectedPriceToman!==undefined && Number(byId.get(x.menuItemId).price_toman)!==x.expectedPriceToman))throw new HttpError(409,'MENU_PRICE_CHANGED','قیمت یک یا چند قلم تغییر کرده است. پیش از ارسال، قیمت‌های جدید را تأیید کنید.');
   let sId=sessionId;
   if(!sId){const s=await client.query('INSERT INTO table_sessions(restaurant_id,branch_id,table_id,opened_by) VALUES($1,$2,$3,$4) RETURNING id',[user.restaurantId,table.branch_id,table.id,user.id]);sId=s.rows[0].id;}
   const roundId=randomUUID();
   await client.query('INSERT INTO order_rounds(id,restaurant_id,session_id,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5)',[roundId,user.restaurantId,sId,user.id,body.idempotencyKey]);
   for(const item of body.items){const m=byId.get(item.menuItemId);await client.query('INSERT INTO order_items(restaurant_id,round_id,menu_item_id,name_snapshot,quantity,unit_price_toman,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[user.restaurantId,roundId,m.id,m.name,item.quantity,m.price_toman,item.note]);}
   await client.query('UPDATE table_sessions SET version=version+1 WHERE id=$1',[sId]);
   await logEvent(client,user,sId,'round.created',{roundId,lines:body.items.length});
   return {roundId,sessionId:sId,replayed:false};
 });
}
export async function transitionItem(user,itemId,body){
 requireUuid(itemId,'قلم');
 if(!body||typeof body.to!=='string'||typeof body.expectedStatus!=='string')throw new HttpError(400,'VALIDATION','وضعیت ارسالی نامعتبر است.');
 nextItemStatus(body.expectedStatus,body.to,user.role,body.reason);
 return withTenant(user,async client=>{
   // Lock order table -> session -> item in consistent sequence with checkout/add round.
   const found=await client.query(`SELECT oi.id,oi.status,r.session_id,s.table_id FROM order_items oi JOIN order_rounds r ON r.id=oi.round_id JOIN table_sessions s ON s.id=r.session_id WHERE oi.id=$1`,[itemId]);
   if(!found.rowCount)throw new HttpError(404,'NOT_FOUND','قلم پیدا نشد.');
   await lockTable(client,found.rows[0].table_id);
   const sess=await requireSession(client,found.rows[0].session_id,{lock:true});
   if(sess.closed_at)throw new HttpError(409,'CLOSED','این میز تسویه شده است.');
   const cur=await client.query('SELECT id,status FROM order_items WHERE id=$1 FOR UPDATE',[itemId]);
   if(!cur.rowCount)throw new HttpError(404,'NOT_FOUND','قلم پیدا نشد.');
   if(cur.rows[0].status!==body.expectedStatus)throw new HttpError(409,'STALE_ITEM','وضعیت این غذا تغییر کرده است.');
   nextItemStatus(cur.rows[0].status,body.to,user.role,body.reason);
   await client.query('UPDATE order_items SET status=$2,updated_at=now() WHERE id=$1',[itemId,body.to]);
   await client.query('UPDATE table_sessions SET version=version+1 WHERE id=$1',[sess.id]);
   await logEvent(client,user,sess.id,'item.transition',{itemId,from:body.expectedStatus,to:body.to,reason:body.to==='cancelled'?body.reason.trim():null});
   return {itemId,status:body.to};
 });
}
export async function setDiscount(user,sessionId,body){
 requiredRole(user,['cashier','manager']);requireUuid(sessionId,'نشست');
 const amount=requireInt(body?.amountToman,0,1000000000,'تخفیف');const expected=requireInt(body?.expectedVersion,1,1000000000,'نسخه');
 return withTenant(user,async client=>{
  const s0=await requireSession(client,sessionId);await lockTable(client,s0.table_id);
  const s=await requireSession(client,sessionId,{lock:true});
  if(s.closed_at)throw new HttpError(409,'CLOSED','صورت‌حساب تسویه شده است.');
  if(s.version!==expected)throw new HttpError(409,'STALE_VERSION','صورت‌حساب تغییر کرده است. دوباره بررسی کنید.');
  const items=await getSessionItems(client,sessionId),subtotal=sumSubtotal(items);
  if(amount>subtotal)throw new HttpError(400,'DISCOUNT_TOO_LARGE','تخفیف نمی‌تواند بیشتر از مبلغ سفارش باشد.');
  await client.query('UPDATE table_sessions SET discount_toman=$2,version=version+1 WHERE id=$1',[sessionId,amount]);
  await logEvent(client,user,sessionId,'bill.discount',{amountToman:amount});
  return {subtotal,discount:amount,total:subtotal-amount};
 });
}
export async function checkout(user,sessionId,body){
 requiredRole(user,['cashier','manager']);requireUuid(sessionId,'نشست');
 const expected=requireInt(body?.expectedVersion,1,1000000000,'نسخه');
 if(!paymentMethods.includes(body?.method))throw new HttpError(400,'VALIDATION','روش تسویه معتبر نیست.');
 return withTenant(user,async client=>{
  const s0=await requireSession(client,sessionId);await lockTable(client,s0.table_id);
  const s=await requireSession(client,sessionId,{lock:true});
  if(s.closed_at)throw new HttpError(409,'CLOSED','این میز قبلاً تسویه شده است.');
  if(s.version!==expected)throw new HttpError(409,'STALE_VERSION','از زمان مشاهده شما، سفارش تغییر کرده است.');
  const items=await getSessionItems(client,sessionId);
  if(!canCheckout(items))throw new HttpError(409,'UNSERVED','تا تحویل تمام اقلام سفارش امکان بستن میز وجود ندارد.');
  const subtotal=sumSubtotal(items),total=subtotal-s.discount_toman;
  if(total<0)throw new HttpError(409,'BILL_INVALID','مبلغ صورت‌حساب معتبر نیست.');
  await client.query('UPDATE table_sessions SET closed_at=now(),paid_at=now(),payment_method=$2,paid_amount_toman=$3,version=version+1 WHERE id=$1',[sessionId,body.method,total]);
  await logEvent(client,user,sessionId,'session.checked_out',{subtotal,discount:s.discount_toman,total,method:body.method});
  return {sessionId,total,method:body.method};
 });
}

// Closing an entirely cancelled table must not masquerade as a paid bill.
// A manager alone may release it, with an auditable reason and version check.
export async function voidSession(user,sessionId,body){
 requiredRole(user,['manager']);requireUuid(sessionId,'نشست');
 const expected=requireInt(body?.expectedVersion,1,1000000000,'نسخه');
 const reason=body?.reason;
 if(typeof reason!=='string'||reason.trim().length<3||reason.length>200)throw new HttpError(400,'VALIDATION','دلیل بستن میز لغوشده باید بین ۳ تا ۲۰۰ کاراکتر باشد.');
 return withTenant(user,async client=>{
  const s0=await requireSession(client,sessionId);await lockTable(client,s0.table_id);
  const s=await requireSession(client,sessionId,{lock:true});
  if(s.closed_at)throw new HttpError(409,'CLOSED','این میز قبلاً بسته شده است.');
  if(s.version!==expected)throw new HttpError(409,'STALE_VERSION','وضعیت میز تغییر کرده است. دوباره بررسی کنید.');
  const items=await getSessionItems(client,sessionId);
  if(!canVoidSession(items))throw new HttpError(409,'NOT_ALL_CANCELLED','بستن بدون دریافت وجه فقط زمانی مجاز است که همه اقلام لغو شده باشند.');
  await client.query('UPDATE table_sessions SET closed_at=now(),version=version+1 WHERE id=$1',[sessionId]);
  await logEvent(client,user,sessionId,'session.voided',{reason:reason.trim(),cancelledLines:items.length});
  return {sessionId,voided:true};
 });
}
