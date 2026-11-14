import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderKey,parseOrderRules,safeOrderSuggestions} from '../src/ai-order.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/ai-order-golden.fa.json',import.meta.url),'utf8'));
const names=['چلوکباب کوبیده','زرشک پلو با مرغ','ته‌چین مرغ','میرزاقاسمی','سوپ روز','دوغ محلی','آب معدنی','لیموناد','لاته','اسپرسو','چای زعفرانی','چیزکیک'];
const menu=names.map((name,index)=>({id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),name,price_toman:10000+index*1000,available:true}));
const byName=new Map(menu.map(m=>[m.name,m]));
const aggregate=rows=>{
 const counts=new Map();
 for(const row of rows){
  const key=orderKey(row.menuName)+':'+orderKey(row.note??'');
  counts.set(key,(counts.get(key)??0)+row.quantity);
 }
 return [...counts].sort(([a],[b])=>a.localeCompare(b,'fa-IR'));
};
const selected=['FA01','FA02','FA03','FA04','FA06','FA07','FA08','FA09','FA11','FA13','FA16','FA27','FA34','FA36'];

for(const id of selected){
 const sample=fixture.cases.find(x=>x.id===id);
 test('Persian golden example '+id+' retains menu items, amounts and per-unit notes',()=>{
  assert.ok(sample,'missing fixture');
  const parsed=parseOrderRules(sample.text,menu);
  const guarded=safeOrderSuggestions(parsed,menu);
  const actual=guarded.items.map(row=>({menuName:menu.find(m=>m.id===row.menuItemId)?.name,quantity:row.quantity,note:row.note}));
  assert.deepEqual(aggregate(actual),aggregate(sample.expectedLines),sample.text);
  assert.ok(guarded.requiresConfirmation);
  assert.ok(guarded.items.every(x=>byName.has(x.name)));
 });
}
test('golden corpus is not a fabricated real-provider evaluation',()=>{
 assert.equal(fixture.status.includes('not executed'),true);
 assert.equal(fixture.cases.length,36);
});
