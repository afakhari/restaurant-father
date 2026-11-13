import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpError,parseRound,nextItemStatus,sumSubtotal,canCheckout,normalizeAIResult,requiredRole} from '../src/core.mjs';
const id='00000000-0000-4000-8000-000000000001';
const key='00000000-0000-4000-8000-000000000003';
test('round accepts valid line and rejects forged client price',()=>{
 const round=parseRound({tableId:id,expectedSessionId:null,idempotencyKey:key,items:[{menuItemId:id,quantity:2,note:'بدون پیاز',price_toman:1}]});
 assert.equal(round.items[0].quantity,2);assert.equal(round.items[0].note,'بدون پیاز');assert.equal('price_toman' in round.items[0],false);
});
test('round validates type and bounds rather than coercing input',()=>{
 for(const quantity of ['2',0,-1,1.5,999])assert.throws(()=>parseRound({tableId:id,expectedSessionId:null,idempotencyKey:key,items:[{menuItemId:id,quantity,note:''}]}),HttpError);
 assert.throws(()=>parseRound({tableId:id,expectedSessionId:null,idempotencyKey:key,items:[]}),HttpError);
});
test('kitchen cannot settle and waiter cannot mark preparing',()=>{
 assert.throws(()=>requiredRole({role:'kitchen'},['cashier','manager']),e=>e.status===403);
 assert.throws(()=>nextItemStatus('queued','preparing','waiter'),e=>e.status===403);
});
test('status transitions and cancellation require valid role and reason',()=>{
 assert.equal(nextItemStatus('queued','preparing','kitchen'),'preparing');
 assert.equal(nextItemStatus('preparing','ready','kitchen'),'ready');
 assert.equal(nextItemStatus('ready','served','waiter'),'served');
 assert.throws(()=>nextItemStatus('ready','queued','manager'),e=>e.status===409);
 assert.throws(()=>nextItemStatus('preparing','cancelled','manager','because'),e=>e.status===409);
 assert.throws(()=>nextItemStatus('queued','cancelled','waiter','x'),e=>e.status===400);
});
test('bill excludes cancelled items and cannot checkout until all served',()=>{
 const items=[{quantity:2,unit_price_toman:300000,status:'served'},{quantity:1,unit_price_toman:90000,status:'cancelled'}];
 assert.equal(sumSubtotal(items),600000);assert.equal(canCheckout(items),true);
 assert.equal(canCheckout([...items,{quantity:1,unit_price_toman:1000,status:'ready'}]),false);
 assert.equal(canCheckout([{quantity:1,unit_price_toman:1000,status:'cancelled'}]),false);
});
test('AI only accepts existing menu IDs and bounded quantities',()=>{
 const menu=[{id,available:true},{id:'00000000-0000-4000-8000-000000000002',available:false}];
 const out=normalizeAIResult({items:[{menuItemId:id,quantity:2,note:'شیر کم‌چرب'},{menuItemId:'fake',quantity:7,note:'hack'}],unmatched:'قهوه دیگر'},menu);
 assert.deepEqual(out.items,[{menuItemId:id,quantity:2,note:'شیر کم‌چرب'}]);assert.equal(out.unmatched,'قهوه دیگر');
 assert.throws(()=>normalizeAIResult({items:[{menuItemId:'fake',quantity:1}]},menu),HttpError);
});
