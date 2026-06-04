import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS = 'C:/Users/adam/Desktop/verify_screenshots';
mkdirSync(SCREENSHOTS, { recursive: true });

let step = 0;
async function shot(page, label) {
  step++;
  const p = join(SCREENSHOTS, `${String(step).padStart(2,'0')}_${label}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${label}.png`);
  return p;
}

const browser = await chromium.launch({ headless: false, slowMo: 200 });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

console.log('\n--- 0: Load app ---');
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);
await shot(page, '00_load');

const is_login = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);
if (is_login) {
  console.log('  ❌ On login page - not authenticated. Cannot verify without credentials.');
  await shot(page, '00_login_page');
  await browser.close();
  process.exit(2);
}
console.log('  ✅ Authenticated');

console.log('\n--- 1: Go to Settings > Aliases ---');
await page.goto('http://localhost:5173/settings/aliases', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);
await shot(page, '01_aliases_page');

// Find import button
const import_btn = page.locator('button').filter({ hasText: /import/i }).first();
const import_ok = await import_btn.isVisible({ timeout: 3000 }).catch(() => false);
if (!import_ok) {
  console.log('  ❌ No import button visible');
  await shot(page, '01_no_import');
  await browser.close();
  process.exit(1);
}
console.log('  ✅ Import button found');

console.log('\n--- 2: Open import modal, upload CSV ---');
await import_btn.click();
await page.waitForTimeout(800);
await shot(page, '02_modal_open');

const file_input = page.locator('input[type="file"]');
await file_input.setInputFiles('C:/Users/adam/Desktop/test_import.csv');
await page.waitForTimeout(1200);
await shot(page, '03_preview');

const will_import_count = await page.locator('text="Will import"').count();
const exists_count = await page.locator('text="Already exists"').count();
const invalid_count = await page.locator('text="Invalid"').count();
console.log(`  Badges: will_import=${will_import_count}, exists=${exists_count}, invalid=${invalid_count}`);

const domain_select = page.locator('select').first();
if (await domain_select.isVisible({ timeout: 500 }).catch(() => false)) {
  const domain_val = await domain_select.inputValue();
  console.log(`  Domain selector: "${domain_val}"`);
  if (!['astermail.org','aster.cx'].includes(domain_val)) {
    await domain_select.selectOption('aster.cx');
    await page.waitForTimeout(600);
    await shot(page, '03b_domain_switched');
  }
}

if (will_import_count === 2) {
  console.log('  ✅ Both rows will_import - PASS');
} else {
  console.log(`  ❌ Expected 2 will_import, got ${will_import_count} - FAIL`);
}

console.log('\n--- 3: Run first import ---');
const confirm_btn = page.locator('button').filter({ hasText: /import \d+/i }).first();
const confirm_text = await confirm_btn.textContent().catch(() => '?');
console.log(`  Import button: "${confirm_text.trim()}"`);
await confirm_btn.click();
await page.waitForTimeout(4000);
await shot(page, '04_result');

const result_header = await page.locator('p.font-semibold').textContent().catch(() => '?');
console.log(`  Result header: "${result_header.trim()}"`);

const all_result_lines = await page.locator('.space-y-1\\.5 .flex.items-center').allTextContents().catch(() => []);
for (const line of all_result_lines) console.log(`  Result line: "${line.trim()}"`);

const created_line = await page.locator('text=/\\d+ imported$/').textContent().catch(() => '');
const failed_line = await page.locator('text=/\\d+ failed$/').textContent().catch(() => '');
console.log(`  created="${created_line.trim()}", failed="${failed_line.trim()}"`);

const done_btn = page.locator('button').filter({ hasText: /^done$/i }).first();
await done_btn.click();
await page.waitForTimeout(1500);
await shot(page, '05_after_close');

const alias1_visible = await page.locator('text="testverify1@aster.cx"').isVisible({ timeout: 3000 }).catch(() => false);
const alias2_visible = await page.locator('text="testverify2@aster.cx"').isVisible({ timeout: 3000 }).catch(() => false);
console.log(`  testverify1@aster.cx in list: ${alias1_visible}`);
console.log(`  testverify2@aster.cx in list: ${alias2_visible}`);
if (alias1_visible && alias2_visible) console.log('  ✅ Both aliases appear in list - PASS');
else console.log('  ❌ Aliases not found in list - FAIL');

console.log('\n--- 4: Re-import same CSV - existence check ---');
const import_btn2 = page.locator('button').filter({ hasText: /import/i }).first();
await import_btn2.click();
await page.waitForTimeout(800);
const file_input2 = page.locator('input[type="file"]');
await file_input2.setInputFiles('C:/Users/adam/Desktop/test_import.csv');
await page.waitForTimeout(1500);
await shot(page, '06_second_preview');

const will2 = await page.locator('text="Will import"').count();
const exists2 = await page.locator('text="Already exists"').count();
console.log(`  Second preview: will_import=${will2}, exists=${exists2}`);
if (will2 === 0 && exists2 === 2) console.log('  ✅ Existence check works - PASS');
else console.log(`  ❌ Expected 0 will_import + 2 exists, got ${will2}+${exists2} - FAIL`);

console.log('\n--- 5: Import in skip mode - check skipped count not doubled ---');
const confirm_btn2 = page.locator('button').filter({ hasText: /import \d+/i }).first();
const is_disabled2 = await confirm_btn2.isDisabled({ timeout: 500 }).catch(() => true);
console.log(`  Import button disabled: ${is_disabled2} (expected true for skip mode with 0 will_import)`);

if (is_disabled2) {
  console.log('  ✅ Button disabled - nothing to import in skip mode');
  // Switch to update mode to enable import, run, check count
  const radios = page.locator('input[type="radio"]');
  const radio_count = await radios.count();
  if (radio_count >= 2) {
    await radios.nth(1).click(); // update mode
    await page.waitForTimeout(400);
    await shot(page, '07_update_mode');
    const update_btn_text = await page.locator('button').filter({ hasText: /import \d+/i }).first().textContent().catch(() => '?');
    console.log(`  Update mode button: "${update_btn_text.trim()}"`);
    await page.locator('button').filter({ hasText: /import \d+/i }).first().click();
    await page.waitForTimeout(3000);
    await shot(page, '08_update_result');
    const skipped_line = await page.locator('text=/\\d+ already existed/').textContent().catch(() => '');
    const created_line2 = await page.locator('text=/\\d+ imported$/').textContent().catch(() => '');
    console.log(`  Update result - created: "${created_line2.trim()}", skipped: "${skipped_line.trim()}"`);
    const skipped_num = (skipped_line.match(/(\d+)/) || [])[1];
    if (skipped_num === '0') console.log('  ✅ 0 skipped in update mode - correct');
    else console.log(`  Skipped in update mode: ${skipped_num}`);
  }
} else {
  // Button is enabled - run and check
  await confirm_btn2.click();
  await page.waitForTimeout(3000);
  await shot(page, '07_skip_result');
  const skipped_line = await page.locator('text=/\\d+ already existed/').textContent().catch(() => '');
  const skipped_num = (skipped_line.match(/(\d+)/) || [])[1];
  console.log(`  Skip result skipped: "${skipped_line.trim()}" (${skipped_num})`);
  if (skipped_num === '2') console.log('  ✅ Skipped=2 (not doubled) - PASS');
  else console.log(`  ⚠️  Skipped=${skipped_num} expected 2`);
  await shot(page, '07_skip_result_final');
}

const close_btn = page.locator('button').filter({ hasText: /done|back/i }).first();
await close_btn.click().catch(() => {});
await page.waitForTimeout(500);

console.log('\n--- 6: Check domain address toggles ---');
const toggle_elements = page.locator('button[role="switch"]');
const toggle_count = await toggle_elements.count();
console.log(`  Total toggles visible in alias list: ${toggle_count}`);
if (toggle_count > 0) {
  const first_state = await toggle_elements.first().getAttribute('aria-checked');
  console.log(`  First toggle state: ${first_state}`);
  console.log('  ✅ Toggles present');
} else {
  console.log('  ⚠️  No toggles visible (may need to scroll or may have no domain addresses)');
}
await shot(page, '09_final_list');

await browser.close();
console.log('\nDone. Screenshots at: ' + SCREENSHOTS);
