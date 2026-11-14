// Bounded, provider-independent Persian order suggestions. All output is untrusted until reviewed.
import {HttpError,requireUuid} from './core.mjs';

const digitMap={};
for(let n=0;n<10;n++){digitMap[String.fromCharCode(0x6f0+n)]=String(n);digitMap[String.fromCharCode(0x660+n)]=String(n);}
const words=new Map([['یک',1],['یه',1],['یکی',1],['دو',2],['دوتا',2],['سه',3],['چهار',4],['پنج',5],['شش',6],['هفت',7],['هشت',8],['نه',9],['ده',10],['یازده',11],['دوازده',12],['سیزده',13],['چهارده',14],['پانزده',15],['شانزده',16],['هفده',17],['هجده',18],['نوزده',19],['بیست',20]]);
export function orderKey(input){return String(input??'').normalize('NFKC').replace(/[٠-٩۰-۹]/g,c=>digitMap[c]??c).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('fa-IR');}
const notePrefixes=/^(?:یکی|یکیش|اون یکی|یکی‌ش|دوتاش|دو تاش)\s+(.+)$/u;
const qualifier=/^(?:بدون|کم|زیاد|با |معمولی|داغ|سرد|یخ|شکر|قند)/u;
const maxText=800;
const clean=t=>typeof t==='string'?t.trim():'';
const issue=(text,reason,candidateMenuItemIds=[])=>({text:String(text??'').slice(0,800),reason,candidateMenuItemIds});
export function validateOrderRequest(body){
 if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'VALIDATION','درخواست نامعتبر است.');
 const tableId=requireUuid(body.tableId,'میز');
 const expectedSessionId=body.expectedSessionId===null?null:requireUuid(body.expectedSessionId,'نشست میز');
 const clientRequestId=requireUuid(body.clientRequestId,'شناسه درخواست');
 if(!Number.isSafeInteger(body.sourceRevision)||body.sourceRevision<0||body.sourceRevision>1000000)throw new HttpError(400,'VALIDATION','نسخه توضیح سفارش نامعتبر است.');
 const text=clean(body.note);
 if(text.length<4||text.length>maxText)throw new HttpError(422,'ORDER_TEXT_LENGTH','توضیح سفارش باید بین ۴ تا ۸۰۰ نویسه باشد.');
 // Do not send identifiable customer contact or payment data to external providers.
 const latin=orderKey(text).replace(/[\s\-]/g,'');
 if(/(?:\+?98|0)9[0-9]{9}/.test(latin)||/(?:[0-9]{4}){4}/.test(latin)||/[^\d]\d{10,}[^\d]/.test(' '+latin+' '))throw new HttpError(422,'ORDER_PRIVATE_DATA','اطلاعات تماس یا پرداخت را از توضیح سفارش حذف کنید.');
 return {tableId,expectedSessionId,clientRequestId,sourceRevision:body.sourceRevision,text};
}
function numberBefore(text,nameKey){
 const key=orderKey(text),idx=key.indexOf(nameKey);if(idx<0)return 1;
 const before=key.slice(0,idx).trim().replace(/(?:عدد|تا)\s*$/,'').trim();
 const last=before.split(/\s+/).at(-1);
 if(/^[0-9]+$/.test(last??''))return Number(last);
 return words.get(last)??1;
}
function candidates(text,menu){
 const k=orderKey(text);
 return menu.filter(m=>m.available&&orderKey(m.name).split(' ').some(w=>w.length>=4&&k.includes(w))).slice(0,5).map(m=>m.id);
}
// Deliberately conservative local fallback. It is NOT an AI model.
export function parseOrderRules(text,menu){
 const segments=text.split(/[،,؛;\n]+|\s+و\s+/u).map(clean).filter(Boolean);
 const items=[],unresolved=[];
 for(const segment of segments){
  const key=orderKey(segment);
  const matched=menu.filter(m=>m.available&&key.includes(orderKey(m.name))).sort((a,b)=>orderKey(b.name).length-orderKey(a.name).length);
  if(matched.length){
   const item=matched[0],nameKey=orderKey(item.name);
   if(matched.length>1){unresolved.push(issue(segment,'multiple_menu_items',matched.map(m=>m.id)));continue;}
   if(key.split(nameKey).length>2){unresolved.push(issue(segment,'repeated_mention',[item.id]));continue;}
   const qty=numberBefore(segment,nameKey);
   if(!Number.isInteger(qty)||qty<1||qty>20){unresolved.push(issue(segment,'invalid_quantity'));continue;}
   const after=key.slice(key.indexOf(nameKey)+nameKey.length).trim();
   let note='',specificCount=0;
   const match=after.match(/^(?:یکی|یکیش|اون یکی|دوتاش|دو تاش)\s+(.+)$/u);
   if(match){specificCount=/^(?:دوتاش|دو تاش)/u.test(after)?2:1;note=match[1].trim();}
   else if(after&&qualifier.test(after)){note=after;}
   else if(after){unresolved.push(issue(after,'extra_text'));}
   if(specificCount){
    if(qty<=specificCount){unresolved.push(issue(segment,'ambiguous_unit_note'));continue;}
    items.push({menuItemId:item.id,quantity:specificCount,note,sourceText:segment});
    items.push({menuItemId:item.id,quantity:qty-specificCount,note:'',sourceText:segment});
   }else items.push({menuItemId:item.id,quantity:qty,note,sourceText:segment});
  }else {
   const m=key.match(notePrefixes);
   const prev=items.at(-1);
   if(m&&prev){
    const amount=/^(?:دوتاش|دو تاش)/u.test(key)?2:1;
    if(prev.quantity<=amount){unresolved.push(issue(segment,'ambiguous_unit_note'));continue;}
    const copy={...prev,quantity:amount,note:m[1],sourceText:segment};
    prev.quantity-=amount;items.push(copy);
   }else if(/^(?:دوتا|دو تا|یکی)\s+معمولی$/u.test(key) && items.length){ /* already represented by the unmodified remainder */ }
   else unresolved.push(issue(segment,'unmatched',candidates(segment,menu)));
  }
 }
 if(!items.length&&!unresolved.length)unresolved.push(issue(text,'unmatched'));
 return {items,unresolved};
}
export function validateModelSuggestion(payload,menu,originalText){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.items))throw new HttpError(502,'AI_INVALID','ساختار پاسخ دستیار معتبر نیست.');
 if(payload.items.length>40)throw new HttpError(502,'AI_INVALID','پاسخ دستیار بیش از حد بزرگ است.');
 const valid=new Map(menu.filter(m=>m.available).map(m=>[m.id,m]));
 const lines=[],unresolved=[];
 for(const entry of payload.items){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)){unresolved.push(issue('قلم نامعتبر','invalid_item'));continue;}
  const witness=clean(entry.sourceText)||clean(entry.evidence)||'قلم پیشنهادشده';
  if(!valid.has(entry.menuItemId)){unresolved.push(issue(witness,'unknown_menu_item'));continue;}
  if(!Number.isInteger(entry.quantity)||entry.quantity<1||entry.quantity>20){unresolved.push(issue(witness,'invalid_quantity',[entry.menuItemId]));continue;}
  if(typeof entry.note!=='string'||entry.note.length>240){unresolved.push(issue(witness,'invalid_note',[entry.menuItemId]));continue;}
  if(lines.length>=12){unresolved.push(issue(witness,'too_many_lines',[entry.menuItemId]));continue;}
  lines.push({menuItemId:entry.menuItemId,quantity:entry.quantity,note:entry.note.trim(),sourceText:witness.slice(0,200)});
 }
 if(Array.isArray(payload.unresolved))for(const part of payload.unresolved.slice(0,40)){
  const t=clean(typeof part==='string'?part:part?.text);
  if(t)unresolved.push(issue(t,'unmatched',candidates(t,menu)));
 }
 if(clean(payload.unmatched))unresolved.push(issue(payload.unmatched,'unmatched',candidates(payload.unmatched,menu)));
 if(!lines.length&&!unresolved.length)unresolved.push(issue(originalText,'unmatched'));
 return {items:lines,unresolved};
}
export function safeOrderSuggestions(extracted,menu){
 const allowed=new Map(menu.filter(m=>m.available).map(m=>[m.id,m]));
 const items=[],unresolved=[...extracted.unresolved];
 for(const line of extracted.items){
  const item=allowed.get(line.menuItemId);
  if(!item){unresolved.push(issue(line.sourceText,'unknown_menu_item'));continue;}
  if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20||clean(line.note).length>240){
   unresolved.push(issue(line.sourceText,'invalid_item',[line.menuItemId]));continue;
  }
  if(items.length>=12){unresolved.push(issue(line.sourceText,'too_many_lines',[line.menuItemId]));continue;}
  items.push({menuItemId:item.id,name:item.name,priceToman:Number(item.price_toman),quantity:line.quantity,note:line.note,sourceText:line.sourceText});
 }
 return {items,unresolved,requiresConfirmation:true};
}
