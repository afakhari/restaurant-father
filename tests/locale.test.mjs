import test from 'node:test';
import assert from 'node:assert/strict';
import {asciiDigits,searchKey,parseTomanInput,parseCountInput} from '../src/public/iran-locale.js';

test('Iranian cashier input accepts Persian and Arabic-Indic digits without a hidden rial conversion',()=>{
 assert.equal(parseTomanInput('۵۰٬۰۰۰'),50000);
 assert.equal(parseTomanInput('٥٠,٠٠٠'),50000);
 assert.equal(parseTomanInput('50 000'),50000);
 assert.equal(parseTomanInput('۰'),0);
 for(const input of ['-۵۰۰','۱۰٫۵','۱۲۰ تومان','', '1000000001','1e4']) assert.equal(parseTomanInput(input),null,input);
});
test('Persian text search normalizes Arabic keyboard shapes, half-space and diacritics',()=>{
 assert.equal(searchKey('كبابِ كوبيده'),searchKey('کباب کوبیده'));
 assert.equal(searchKey('آب‌معدنی'),searchKey('آب معدنی'));
 assert.equal(asciiDigits('۱۲٣'), '123');
});
test('AI preview quantities must be valid integers between 1 and 20',()=>{
 assert.equal(parseCountInput('۲'),2);
 assert.equal(parseCountInput('٢٠'),20);
 for(const input of ['۰','۲۱','۱٫۵','-۲','','2e1'])assert.equal(parseCountInput(input),null);
});
