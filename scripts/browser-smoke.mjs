// Browser acceptance run for an isolated seeded demo database.
// The GitHub Actions job records a REAL Chromium session and saves screenshots.
// This is automated UX evidence, NOT a candidate-narrated 5–10 minute walkthrough.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:3000';
const output = process.env.BROWSER_ARTIFACT_DIR ?? 'artifacts/browser-evidence';
const password = process.env.DEMO_PASSWORD ?? 'Demo-Shift-1405!';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(e.message));
page.on('dialog', dialog => dialog.accept());
const snap = async (name) => {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
};
const login = async (email) => {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#login-submit').click();
  await page.locator('.main-nav').waitFor({ state: 'visible' });
};
const logout = async () => {
  await page.locator('[data-action="logout"]').click();
  await page.locator('#login-form').waitFor({ state: 'visible' });
};
const chooseTable = async (number) => {
  await page.locator('.table-tile').filter({ hasText: `میز ${new Intl.NumberFormat('fa-IR').format(number)}` }).click();
};
const sendRound = async (itemName) => {
  await page.locator(`button.add[aria-label="افزودن ${itemName}"]`).click();
  await page.locator('button[data-action="submit-round"]').click();
  await page.locator('.current-item').filter({ hasText: itemName }).first().waitFor();
};
const kitchenItem = (name) => page.locator('.kds-ticket').filter({ hasText: 'میز ۸' }).filter({ hasText: name });
const move = async (name, to) => {
  const selector = `button[data-action="transition"][data-to="${to}"]`;
  await kitchenItem(name).locator(selector).click();
  if (to === 'preparing') await kitchenItem(name).locator('button[data-to="ready"]').waitFor();
  else await kitchenItem(name).locator('.okay-box').waitFor();
};
let finalized = false;
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-form').waitFor();
  // Verify the real served font, legible core design tokens, and visible focus states.
  const typography = await page.evaluate(async () => {
    await document.fonts.ready;
    const fontResponse = await fetch('/fonts/vazirmatn-arabic.woff2');
    const style = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    const luminance = (hex) => {
      const raw = String(hex).trim().replace(/^#/, '');
      const full = raw.length === 3 ? [...raw].map(x => x + x).join('') : raw;
      const rgb = full.match(/[0-9a-f]{2}/gi)?.slice(0, 3).map(x => parseInt(x, 16) / 255);
      if (!rgb || rgb.length !== 3) return 0;
      return rgb.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
        .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    };
    const contrast = (a, b) => {
      const x = luminance(a), y = luminance(b);
      return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    };
    const palette = Object.fromEntries(['--ink','--muted','--paper','--cream','--accent-deep']
      .map(key => [key, root.getPropertyValue(key).trim()]));
    return {
      fontStatus: fontResponse.status,
      fontMime: fontResponse.headers.get('content-type'),
      family: style.fontFamily,
      loaded: document.fonts.check('400 14px "Vazirmatn UI"', 'شیفت‌یار'),
      bodyWeight: style.fontWeight,
      palette,
      textContrast: contrast(palette['--ink'], palette['--paper']),
      secondaryContrast: contrast(palette['--muted'], palette['--cream']),
      accentContrast: contrast(palette['--accent-deep'], palette['--paper']),
    };
  });
  console.log('VISUAL_SYSTEM_AUDIT', JSON.stringify(typography));
  assert.equal(typography.fontStatus, 200, 'Persian font must be served by this app');
  assert.match(typography.fontMime ?? '', /font\/woff2/, 'Font must have the correct MIME type');
  assert.match(typography.family, /Vazirmatn UI/, 'Local Persian font must be first in the font stack');
  assert.equal(typography.loaded, true, 'Persian font must finish loading');
  assert.ok(typography.textContrast >= 7, 'Primary ink should have AAA contrast');
  assert.ok(typography.secondaryContrast >= 4.5, 'Secondary text must be readable on the app background');
  assert.ok(typography.accentContrast >= 4.5, 'Editorial accent text must be readable');
  console.log('VISUAL_SYSTEM_PASS', JSON.stringify(typography));
  await snap('01-login');
  await login('waiter@narenj.demo');
  await page.locator('.table-tile').first().waitFor();
  assert.ok((await page.locator('.table-tile').count()) >= 8, 'Initial demo must open busy central branch, not an empty branch');
  await snap('02-waiter-hall');
  await chooseTable(8);
  await sendRound('چای زعفرانی');
  await sendRound('لیموناد'); // Two rounds in the SAME table session.
  const rounds = await page.locator('.round-sep').count();
  assert.equal(rounds, 2, 'Table eight must retain both distinct rounds');
  await snap('03-waiter-two-rounds');
  await logout();

  await login('kitchen@narenj.demo');
  await kitchenItem('چای زعفرانی').waitFor();
  await snap('04-kitchen-new');
  await move('چای زعفرانی', 'preparing');
  await move('لیموناد', 'preparing');
  await snap('05-kitchen-preparing');
  await move('چای زعفرانی', 'ready');
  await move('لیموناد', 'ready');
  await snap('06-kitchen-ready');
  await logout();

  await login('waiter@narenj.demo');
  await chooseTable(8);
  await page.locator('.current-item').filter({ hasText: 'چای زعفرانی' }).locator('button[data-to="served"]').click();
  await page.locator('.current-item').filter({ hasText: 'لیموناد' }).locator('button[data-to="served"]').click();
  await snap('07-waiter-handoff');
  await logout();

  await login('cashier@narenj.demo');
  await page.locator('.cash-table').filter({ hasText: 'میز ۸' }).click();
  const checkout = page.locator('button[data-action="checkout"]');
  assert.equal(await checkout.isDisabled(), false, 'Fully delivered table must be payable');
  await snap('08-cashier-bill');
  await page.locator('#discount-input').fill('۱۰٬۰۰۰');
  await page.locator('[data-action="discount"]').click();
  await page.locator('[data-action="checkout"]').click();
  await page.locator('#action-dialog[open]').waitFor();
  assert.match(await page.locator('#dialog-details').innerText(), /دریافت شده است/);
  const [checkoutResponse] = await Promise.all([
    page.waitForResponse(res=>res.url().includes('/checkout') && res.request().method()==='POST'),
    page.locator('#dialog-confirm').click(),
  ]);
  assert.equal(checkoutResponse.status(),200,'Cashier receipt confirmation must actually settle the table');
  await page.locator('.history-line').filter({ hasText: 'میز ۸' }).waitFor();
  await snap('09-cashier-settled');
  await logout();

  await login('manager@darband.demo');
  await page.locator('.top-pill').filter({ hasText: 'رستوران دربند' }).waitFor();
  assert.equal(await page.locator('body').textContent().then(t => t.includes('چلوکباب کوبیده')), false, 'No Narenj menu may leak into Darband tenant');
  await snap('10-independent-tenant');
  await logout();

  // Manager-only exception: cancel a whole mistaken order and free the table
  // WITHOUT falsifying a payment. This path has to work through the UI.
  await login('manager@narenj.demo');
  await chooseTable(7);
  await sendRound('چای زعفرانی');
  await page.locator('.current-item').filter({hasText:'چای زعفرانی'}).locator('[data-action="cancel"]').click();
  await page.locator('#dialog-reason').fill('مشتری سفارش را لغو کرد');
  const [cancelResponse]=await Promise.all([
    page.waitForResponse(res=>res.url().includes('/transition')&&res.request().method()==='POST'),
    page.locator('#dialog-confirm').click(),
  ]);
  assert.equal(cancelResponse.status(),200,'Manager cancellation must be persisted');
  await logout();
  await login('cashier@narenj.demo');
  await page.locator('.cash-table').filter({hasText:'میز ۷'}).click();
  assert.match(await page.locator('.warn-box').innerText(),/از مدیر درخواست کنید/,'Cashier must be told who can release an all-cancelled table');
  assert.equal(await page.locator('[data-action="void-session"]').count(),0,'Cashier must not receive manager-only action');
  assert.equal(await page.locator('[data-action="checkout"]').isDisabled(),true,'All-cancelled table must never be paid');
  await logout();
  await login('manager@narenj.demo');
  await page.locator('.nav-btn[data-id="cashier"]').click();
  await page.locator('.cash-table').filter({hasText:'میز ۷'}).click();
  await page.locator('[data-action="void-session"]').click();
  await page.locator('#dialog-reason').fill('مشتری کل سفارش را لغو کرد');
  const [voidResponse]=await Promise.all([
    page.waitForResponse(res=>res.url().includes('/void')&&res.request().method()==='POST'),
    page.locator('#dialog-confirm').click(),
  ]);
  assert.equal(voidResponse.status(),200,'Fully cancelled table must close without creating a payment');
  await page.locator('.history-line').filter({hasText:'میز ۷'}).waitFor();
  await snap('10b-manager-void-no-payment');
  await logout();

  // Responsive matrix for the *actual* database-backed UI: no hidden ordering flow,
  // horizontal overflow, or inaccessible order review at common phone/tablet widths.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', e => consoleErrors.push(e.message));
    await mobilePage.goto(origin, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('#login-form').waitFor();
    await mobilePage.screenshot({path:path.join(output,'11a-mobile-login.png'),fullPage:true});
    await mobilePage.locator('#email').fill('waiter@narenj.demo');
    await mobilePage.locator('#password').fill(password);
    await mobilePage.locator('#login-submit').click();
    await mobilePage.locator('.main-nav').waitFor();
    await mobilePage.locator('.hall-layout[data-mobile-stage="tables"] .table-tile').first().waitFor();
    await mobilePage.screenshot({path:path.join(output,'11-mobile-waiter.png'),fullPage:true});
    await mobilePage.locator('.table-tile').filter({ hasText:'میز ۳' }).click();
    await mobilePage.locator('.hall-layout[data-mobile-stage="menu"] button.add').first().waitFor();
    await mobilePage.locator('button.add').first().click();
    await mobilePage.locator('button.add').first().click();
    await mobilePage.locator('.mobile-draft-bar').waitFor({state:'visible'});
    await mobilePage.screenshot({path:path.join(output,'12-mobile-menu-cart.png'),fullPage:true});
    await mobilePage.locator('.mobile-draft-bar [data-id="order"]').click();
    await mobilePage.locator('.hall-layout[data-mobile-stage="order"] .draft-line').first().waitFor();
    await mobilePage.locator('.draft-line').first().locator('[data-action="split-note"]').click();
    assert.equal(await mobilePage.locator('.draft-line').count(),2,'Two identical drinks must be split for distinct preparation notes');
    await mobilePage.locator('[data-draft-note="1"]').fill('یکی بدون یخ');
    await mobilePage.locator('.hall-step[data-id="menu"]').click();
    await mobilePage.locator('#menu-search').fill('كباب'); // Arabic keyboard kāf, Persian stored ک
    assert.ok(await mobilePage.locator('.menu-item').count()>0,'Arabic keyboard search must find Persian menu names');
    await mobilePage.locator('#menu-search').fill('');
    await mobilePage.locator('.hall-step[data-id="order"]').click();
    assert.equal(await mobilePage.locator('[data-draft-note="1"]').inputValue(),'یکی بدون یخ');
    await mobilePage.screenshot({path:path.join(output,'13-mobile-order-review.png'),fullPage:true});
    // A navigation across tables must not silently discard a typed draft.
    await mobilePage.locator('.hall-step[data-id="tables"]').click();
    mobilePage.once('dialog',dialog=>dialog.dismiss());
    await mobilePage.locator('.table-tile').filter({hasText:'میز ۴'}).click();
    assert.equal(await mobilePage.locator('.mobile-draft-bar').isVisible(),true,'Declining a change must preserve the cart');
    for(const width of [320,360,390,768,1024,1440]){
      await mobilePage.setViewportSize({width,height:844});
      const size=await mobilePage.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(size.scrollWidth<=size.viewport+2,`Waiter layout overflows ${width}px: ${JSON.stringify(size)}`);
    }
  } finally { await mobile.close(); }
  for(const role of ['kitchen@narenj.demo','cashier@narenj.demo']){
    const roleCtx=await browser.newContext({viewport:{width:390,height:844}});
    try{
      const rolePage=await roleCtx.newPage();
      rolePage.on('pageerror', e=>consoleErrors.push(e.message));
      await rolePage.goto(origin,{waitUntil:'domcontentloaded'});
      await rolePage.locator('#email').fill(role);
      await rolePage.locator('#password').fill(password);
      await rolePage.locator('#login-submit').click();
      await rolePage.locator('.main-nav').waitFor();
      const size=await rolePage.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(size.scrollWidth<=size.viewport+2,`Role ${role} overflows on phone`);
      await rolePage.screenshot({path:path.join(output,role.startsWith('kitchen')?'14-mobile-kitchen.png':'15-mobile-cashier.png'),fullPage:true});
    }finally{await roleCtx.close();}
  }
  assert.deepEqual(consoleErrors, [], 'Browser must not raise uncaught JS errors');
  await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify({passed:true,rounds,roles:['waiter','kitchen','cashier','manager'],stages:['order','prepare','ready','serve','checkout','tenant-isolation','mobile-steps','draft-loss-prevention','responsive-matrix','persian-discount','manager-void','split-notes','arabic-keyboard-search'],consoleErrors},null,2));
  finalized = true;
  console.log('BROWSER_ACCEPTANCE_PASS: waiter, kitchen, handoff, cashier, tenant isolation and mobile');
} catch (err) {
  await snap('FAILURE-current-screen').catch(()=>{});
  console.error('BROWSER_ACCEPTANCE_FAIL',err);
  process.exitCode=1;
} finally {
  const video = page.video();
  await context.close();
  if(video){
    const file = await video.path();
    await fs.copyFile(file,path.join(output,'automated-browser-tour.webm'));
    await fs.rm(file,{force:true});
  }
  await browser.close();
}
if(!finalized) console.error('Browser evidence is incomplete; see FAILURE screenshot.');
