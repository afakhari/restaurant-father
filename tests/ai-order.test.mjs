import test from 'node:test';
import assert from 'node:assert/strict';
import {orderKey,validateOrderRequest,parseOrderRules,validateModelSuggestion,safeOrderSuggestions} from '../src/ai-order.mjs';
import {parseRound} from '../src/core.mjs';
const ids=Array.from({length:15},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const menu=[
 {id:ids[0],name:'لاته',description:'قهوه و شیر',price_toman:125000,available:true},
 {id:ids[1],name:'چیزکیک',description:'',price_toman:148000,available:true},
 {id:ids[2],name:'اسپرسو',description:'',price_toman:85000,available:true},
 {id:ids[3],name:'آب معدنی',description:'',price_toman:22000,available:false}
];
const context={tableId:ids[5],expectedSessionId:null,clientRequestId:ids[6],sourceRevision:0};
test('Persian normalizer standardizes Arabic keyboard and numerals',()=>{
 assert.equal(orderKey('٢ تا كيكِ‌ پنيري'), '2 تا کیک پنیری');
});
test('rule extraction handles two clear dishes and Arabic/Persian numbers',()=>{
 const x=parseOrderRules('٢ لاته و ۳ چیزکیک',menu);
 assert.deepEqual(x.items.map(i=>[i.menuItemId,i.quantity]),[[ids[0],2],[ids[1],3]]);
 assert.equal(x.unresolved.length,0);
});
test('per-unit note never applies to both drinks',()=>{
 for(const text of ['دو تا لاته، یکی کم‌شیر','دو لاته یکی کم‌شیر']){
  const result=parseOrderRules(text,menu);
  assert.equal(result.items.length,2,text);
  assert.deepEqual(result.items.map(x=>x.quantity),[1,1],text);
  assert.equal(result.items.filter(x=>x.note).length,1,text);
 }
});
test('unknown menu is reported and unavailable items are not inferred',()=>{
 const x=parseOrderRules('نوشابه و آب معدنی',menu);
 assert.equal(x.items.length,0);
 assert.equal(x.unresolved.length,2);
});
test('schema errors, private data and invalid IDs reject without provider calls',()=>{
 for(const value of ['','ف','سه لاته تماس بگیر 09121234567','لطفاً به کارت 6037991234567890 بزن']){
  assert.throws(()=>validateOrderRequest({...context,note:value}),e=>[400,422].includes(e.status),value);
 }
 assert.equal(validateOrderRequest({...context,note:'دو تا لاته'}).text,'دو تا لاته');
 assert.throws(()=>validateOrderRequest({...context,note:'دو لاته',clientRequestId:'nope'}),e=>e.status===400);
});
test('model invalid items are visible as unresolved rather than silently disappearing',()=>{
 const x=validateModelSuggestion({items:[
  {menuItemId:ids[0],quantity:2,note:'یکی کم‌شیر',sourceText:'دو لاته'},
  {menuItemId:'invalid',quantity:1,note:'',sourceText:'غذای ناموجود'},
  {menuItemId:ids[0],quantity:21,note:'',sourceText:'بیست و یک لاته'},
  {menuItemId:ids[3],quantity:1,note:'',sourceText:'آب معدنی'}
 ],unmatched:'نوشابه'},menu,'دو لاته');
 assert.equal(x.items.length,1);
 assert.equal(x.unresolved.length,4);
 const final=safeOrderSuggestions(x,menu);
 assert.equal(final.unresolved.length,4);
 assert.equal(final.items[0].priceToman,125000);
 assert.equal(final.requiresConfirmation,true);
});
test('overflow of 12 model lines is explicit and cannot hide the 13th',()=>{
 const items=Array.from({length:13},()=>({menuItemId:ids[0],quantity:1,note:'',sourceText:'لاته'}));
 const result=validateModelSuggestion({items},menu,'لاته');
 assert.equal(result.items.length,12);
 assert.equal(result.unresolved.length,1);
 assert.equal(result.unresolved[0].reason,'too_many_lines');
});
test('line-specific price expectation stays separate from client-provided price',()=>{
 const r=parseRound({tableId:ids[5],expectedSessionId:null,idempotencyKey:ids[6],items:[
  {menuItemId:ids[0],quantity:1,note:'',expectedPriceToman:125000,price_toman:1}
 ]});
 assert.equal(r.items[0].expectedPriceToman,125000);
 assert.equal('price_toman' in r.items[0],false);
 assert.throws(()=>parseRound({tableId:ids[5],expectedSessionId:null,idempotencyKey:ids[6],items:[{menuItemId:ids[0],quantity:1,note:'',expectedPriceToman:-1}]}));
});

test('two separate modifiers attach to two different latte units',()=>{
 const x=parseOrderRules('دو لاته، یکی کم‌شیر، اون یکی بدون شکر',menu);
 assert.equal(x.items.length,2);
 assert.equal(x.unresolved.length,0);
 assert.deepEqual(x.items.map(v=>orderKey(v.note)).sort(),['بدون شکر','کم شیر'].sort());
 assert.deepEqual(x.items.map(v=>v.quantity).sort(),[1,1]);
});
test('ambiguous multiple menu names and repeated mentions fail closed',()=>{
 const multi=parseOrderRules('یک لاته یک چیزکیک',menu);
 assert.equal(multi.items.length,0);
 assert.equal(multi.unresolved[0].reason,'multiple_menu_items');
 const repeated=parseOrderRules('لاته لاته',menu);
 assert.equal(repeated.items.length,0);
 assert.equal(repeated.unresolved[0].reason,'repeated_mention');
});

test('model cannot silently omit a second dish when the first was matched',()=>{
 const extracted=validateModelSuggestion({items:[{menuItemId:ids[0],quantity:2,note:'',sourceText:'دو لاته'}],unmatched:''},menu,'دو لاته و یک چیزکیک');
 assert.equal(extracted.items.length,1);
 assert.ok(extracted.unresolved.some(x=>x.reason==='unaccounted_for'&&x.text.includes('چیزکیک')));
});
test('model must provide source evidence present in the actual utterance',()=>{
 const extracted=validateModelSuggestion({items:[{menuItemId:ids[0],quantity:1,note:'',sourceText:'یک لاته ناموجود در متن'}],unmatched:''},menu,'یک چیزکیک');
 assert.equal(extracted.items.length,0);
 assert.ok(extracted.unresolved.some(x=>x.reason==='unverified_evidence'));
});
test('model cannot apply a single-unit modifier to every unit',()=>{
 const extracted=validateModelSuggestion({items:[{menuItemId:ids[0],quantity:2,note:'کم‌شیر',sourceText:'دو لاته یکی کم‌شیر'}],unmatched:''},menu,'دو لاته یکی کم‌شیر');
 assert.equal(extracted.items.length,0);
 assert.ok(extracted.unresolved.some(x=>x.reason==='ambiguous_unit_note'));
});
