export const roles = ['manager','waiter','kitchen','cashier'];
export const paymentMethods = ['cash','pos','card_to_card'];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class HttpError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
export function requiredRole(user, allowed){if (!allowed.includes(user.role)) throw new HttpError(403,'FORBIDDEN','این عملیات برای نقش شما مجاز نیست.');}
export function requireUuid(value,label='شناسه') {if(typeof value!=='string'||!UUID.test(value))throw new HttpError(400,'VALIDATION',`${label} معتبر نیست.`);return value;}
export function requireInt(v,min,max,label){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new HttpError(400,'VALIDATION',`${label} معتبر نیست.`);return v;}
export function parseRound(body) {
  if(!body||typeof body!=='object')throw new HttpError(400,'VALIDATION','درخواست معتبر نیست.');
  const tableId=requireUuid(body.tableId,'میز');
  const expectedSessionId=body.expectedSessionId===null?null:requireUuid(body.expectedSessionId,'نشست میز');
  const idempotencyKey=requireUuid(body.idempotencyKey,'کلید درخواست');
  if(!Array.isArray(body.items)||body.items.length<1||body.items.length>12)throw new HttpError(400,'VALIDATION','بین ۱ تا ۱۲ قلم انتخاب کنید.');
  const items=body.items.map((x)=>{
    if(!x||typeof x!=='object')throw new HttpError(400,'VALIDATION','قلم نامعتبر است.');
    const menuItemId=requireUuid(x.menuItemId,'غذا');
    const quantity=requireInt(x.quantity,1,20,'تعداد');
    if(typeof x.note!=='string'||x.note.length>240)throw new HttpError(400,'VALIDATION','یادداشت طولانی یا نامعتبر است.');
    return {menuItemId,quantity,note:x.note.trim()};
  });
  return {tableId,expectedSessionId,idempotencyKey,items};
}
export function nextItemStatus(current,to,role,reason=''){
  const map={queued:{preparing:['kitchen','manager'],cancelled:['waiter','manager']},preparing:{ready:['kitchen','manager']},ready:{served:['waiter','manager']}};
  if(!map[current]?.[to])throw new HttpError(409,'INVALID_TRANSITION','تغییر وضعیت در این مرحله مجاز نیست.');
  if(!map[current][to].includes(role))throw new HttpError(403,'FORBIDDEN','تغییر وضعیت برای نقش شما مجاز نیست.');
  if(to==='cancelled'&&(typeof reason!=='string'||reason.trim().length<3||reason.length>200))throw new HttpError(400,'VALIDATION','برای لغو، دلیل روشن و کوتاه ثبت کنید.');
  return to;
}
export function sumSubtotal(items){return items.filter(x=>x.status!=='cancelled').reduce((sum,x)=>sum + Number(x.quantity)*Number(x.unit_price_toman),0);}
export function canCheckout(items){return items.length>0&&items.every(x=>['served','cancelled'].includes(x.status))&&items.some(x=>x.status==='served');}
export function normalizeAIResult(payload,menu){
  if(!payload||!Array.isArray(payload.items))throw new HttpError(502,'AI_INVALID','پاسخ دستیار قابل استفاده نیست.');
  const allowed=new Set(menu.filter(x=>x.available).map(x=>x.id));
  const out=payload.items.slice(0,12).map(x=>{
    if(!allowed.has(x.menuItemId))return null;
    if(!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20)return null;
    return {menuItemId:x.menuItemId,quantity:x.quantity,note:typeof x.note==='string'?x.note.slice(0,240):''};
  }).filter(Boolean);
  if(!out.length)throw new HttpError(422,'AI_NO_MATCH','غذای مشخصی از منوی فعلی پیدا نشد.');
  return {items:out,unmatched:typeof payload.unmatched==='string'?payload.unmatched.slice(0,240):''};
}
