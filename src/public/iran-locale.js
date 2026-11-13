// Pure normalization helpers for Persian/Arabic keyboards. No rial/toman conversion is implied.
export function asciiDigits(value){
 return String(value??'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x06f0))
   .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x0660));
}
export function searchKey(value){
 return String(value??'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک')
   .replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/\u200c/g,' ')
   .replace(/\s+/g,' ').trim().toLocaleLowerCase('fa-IR');
}
export function parseTomanInput(value){
 const digits=asciiDigits(value).trim().replace(/[٬،,\s\u00a0\u200c]/g,'');
 if(!/^\d+$/.test(digits))return null;
 const amount=Number(digits);
 return Number.isSafeInteger(amount)&&amount>=0&&amount<=1_000_000_000?amount:null;
}
export function parseCountInput(value){
 const digits=asciiDigits(value).trim();
 if(!/^\d+$/.test(digits))return null;
 const amount=Number(digits);
 return Number.isInteger(amount)&&amount>=1&&amount<=20?amount:null;
}
