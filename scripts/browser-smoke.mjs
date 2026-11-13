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
  await snap('01-login');
  await login('waiter@narenj.demo');
  await page.locator('.table-tile').first().waitFor();
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
  await page.locator('#discount-input').fill('10000');
  await page.locator('[data-action="discount"]').click();
  await page.locator('[data-action="checkout"]').click();
  await page.locator('.history-line').filter({ hasText: 'میز ۸' }).waitFor();
  await snap('09-cashier-settled');
  await logout();

  await login('manager@darband.demo');
  await page.locator('.top-pill').filter({ hasText: 'رستوران دربند' }).waitFor();
  assert.equal(await page.locator('body').textContent().then(t => t.includes('چلوکباب کوبیده')), false, 'No Narenj menu may leak into Darband tenant');
  await snap('10-independent-tenant');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(origin, { waitUntil: 'domcontentloaded' });
    await mobilePage.locator('#email').fill('waiter@narenj.demo');
    await mobilePage.locator('#password').fill(password);
    await mobilePage.locator('#login-submit').click();
    await mobilePage.locator('.main-nav').waitFor();
    await mobilePage.screenshot({path:path.join(output,'11-mobile-waiter.png'),fullPage:true});
    const sizes = await mobilePage.evaluate(() => ({ viewport: window.innerWidth, root: document.documentElement.scrollWidth }));
    assert.ok(sizes.root <= sizes.viewport + 5, `Unexpected mobile horizontal overflow: ${JSON.stringify(sizes)}`);
  } finally { await mobile.close(); }
  assert.deepEqual(consoleErrors, [], 'Browser must not raise uncaught JS errors');
  await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify({passed:true,rounds,roles:['waiter','kitchen','cashier','manager'],stages:['order','prepare','ready','serve','checkout','tenant-isolation','mobile'],consoleErrors},null,2));
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
