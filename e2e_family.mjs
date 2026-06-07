import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { createHmac } from 'crypto';
import fs from 'fs';
const SHOTS = 'C:/Users/adam/AppData/Local/Temp/e2e_family';
fs.mkdirSync(SHOTS, { recursive: true });
const log = m => console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
const R = [];
const pass = (l, n='') => { R.push(`PASS: ${l}${n?' - '+n:''}`); log(`PASS ${l}${n?' | '+n:''}`); };
const fail = (l, n='') => { R.push(`FAIL: ${l}${n?' - '+n:''}`); log(`FAIL ${l}${n?' | '+n:''}`); };
const info = (l, n='') => { R.push(`INFO: ${l}`); log(`INFO ${l}${n?' | '+n:''}`); };
const exec = cmd => { try { return execSync(cmd, {stdio:['pipe','pipe','pipe']}).toString().trim(); } catch(e) { return (e.stdout||Buffer.from('')).toString().trim() || e.message; } };

log('=== STEP 1: Server health ===');
exec('curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/') === '200' ? pass('Vite (5173)') : fail('Vite down');
exec('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/payments/v1/plans') === '200' ? pass('Backend (3000)') : fail('Backend down');

log('=== STEP 2: API smoke test ===');
const eps14 = [['GET','/api/payments/v1/family'],['GET','/api/payments/v1/family/org/groups'],['GET','/api/payments/v1/family/org/activity?page=1&per_page=20'],['GET','/api/payments/v1/family/org/filters'],['GET','/api/payments/v1/family/org/retention'],['GET','/api/payments/v1/family/org/security'],['GET','/api/payments/v1/family/org/domains'],['GET','/api/payments/v1/family/org/compliance'],['POST','/api/payments/v1/family/org/notify-2fa'],['GET','/api/payments/v1/family/invites/bad-token/preview'],['POST','/api/payments/v1/family/org/groups'],['GET','/api/payments/v1/family/invites'],['POST','/api/payments/v1/activate-subscription'],['GET','/api/core/v1/auth/me']];
let u_ok = true;
for (const [m,ep] of eps14) { const s = exec(`curl -s -o /dev/null -w "%{http_code}" -X ${m} ${m==='POST'?'--data "{}"':''} -H "Content-Type: application/json" "http://localhost:3000${ep}"`); if(!['200','401','403','404'].includes(s)){u_ok=false; fail(`${m} ${ep}`,s);} else log(`  OK ${m} ${ep} -> ${s}`); }
u_ok ? pass('All 14 API endpoints respond') : null;

log('=== STEP 3: Authenticated API ===');
const SECRET = 'd9c6f3b5f59ec2b03a33adc196d3ad19de6513037459a8529714f92bdd915903';
const ts = Math.floor(Date.now()/1000), p = `noauth:${ts}`;
const csrf = `${p}.${createHmac('sha256',SECRET).update(p).digest('base64url')}`;
const dl_raw = exec(`curl -s -X POST http://localhost:3000/api/core/v1/auth/dev-login -H "Origin: http://app.localhost:5173" -H "Content-Type: application/json" -H "x-csrf-token: ${csrf}" -H "Cookie: csrf_token=${csrf}" -c /tmp/fe2e_cookies.txt`);
let dl = {}; try { dl = JSON.parse(dl_raw); } catch {}
if (dl.success) {
  pass(`Dev-login -> ${dl.user_id}`);
  const auth_raw = fs.readFileSync('/tmp/fe2e_cookies.txt','utf8');
  const auth_line = auth_raw.split('\n').find(l => l.includes('aster_auth'));
  const auth = auth_line ? auth_line.split('\t').at(-1).trim() : '';
  const nc = dl.csrf_token;
  const H = `-H "Cookie: aster_auth=${auth}; csrf_token=${nc}" -H "x-csrf-token: ${nc}"`;
  const fam = (() => { try { return JSON.parse(exec(`curl -s http://localhost:3000/api/payments/v1/family ${H}`).slice(0,3000)); } catch { return {}; } })();
  fam.plan_code ? pass(`Family: plan=${fam.plan_code} members=${fam.members?.length??0}`) : fail('Family group', dl_raw.slice(0,100));
  const org_eps = ['/api/payments/v1/family/org/groups','/api/payments/v1/family/org/activity?page=1&per_page=20','/api/payments/v1/family/org/filters','/api/payments/v1/family/org/retention','/api/payments/v1/family/org/security','/api/payments/v1/family/org/domains','/api/payments/v1/family/org/compliance'];
  let a_ok = true;
  for (const e of org_eps) { const s = exec(`curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000${e}" ${H}`); s==='200'?log(`  OK ${e} -> 200`):(a_ok=false,fail(e,s)); }
  a_ok ? pass('All 7 org endpoints 200 (authenticated)') : null;
  const act = (() => { try { return JSON.parse(exec(`curl -s "http://localhost:3000/api/payments/v1/family/org/activity?page=1&per_page=5&event_type=member_joined" ${H}`)); } catch { return {}; } })();
  typeof act.total==='number' ? pass(`Activity filter: total=${act.total}`) : fail('Activity filter failed');
  const notif = (() => { try { return JSON.parse(exec(`curl -s -X POST http://localhost:3000/api/payments/v1/family/org/notify-2fa ${H}`)); } catch { return {}; } })();
  typeof notif.notified==='number' ? pass(`notify-2fa: notified=${notif.notified}`) : fail('notify-2fa failed');
} else { fail('Dev-login failed', dl_raw.slice(0,150)); }

log('=== STEP 4: Browser bundle check ===');
const browser = await chromium.launch({ headless: false, slowMo: 60 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const jse = [], f404 = [];
page.on('console', msg => { const t=msg.text(); if(msg.type()==='error'&&!t.includes('favicon')&&!t.includes('manifest')&&!t.includes('401')&&!t.includes('403')&&!t.includes('vapid')&&!t.includes('Stop!')) jse.push(t); });
page.on('response', res => { if(res.url().includes('/family')&&res.status()===404&&!res.url().includes('invites/')) f404.push(res.status()+' '+res.url()); });
await page.goto('http://app.localhost:5173');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/01_initial.png` });
pass(`App loads (title="${await page.title()}")`);
const url = page.url(); url.includes('sign-in') ? pass('Unauthenticated -> sign-in') : info('URL: '+url);
await page.waitForTimeout(2000);
const crit = jse.filter(e => e.includes('ChunkLoadError')||e.includes('SyntaxError')||e.includes('Unexpected token')||e.includes('Cannot find module')||(e.toLowerCase().includes('error')&&e.includes('family_section')));
crit.length===0 ? pass('No critical JS errors') : fail('Critical JS errors', crit.slice(0,2).join('|'));
(await page.locator('input').count()) >= 2 ? pass('Sign-in form rendered') : fail('Sign-in inputs missing');
await page.screenshot({ path: `${SHOTS}/02_signin.png` });
f404.length===0 ? pass('No family API 404s in network') : fail('Family 404s: '+f404.join(', '));

log('=== STEP 5: Static checks ===');
const fam_src = fs.readFileSync('src/components/settings/billing/family_section.tsx', 'utf8');
fam_src.includes('from "@/components/ui/select"') ? pass('Custom Select imported') : fail('Select import missing');
!fam_src.includes('<select') ? pass('No native <select> elements') : fail('Native selects present');
fam_src.includes('get_member_compliance')&&fam_src.includes('set_compliance_map') ? pass('Compliance preload present') : fail('Compliance preload missing');
!fam_src.includes('Switch to Duo')&&!fam_src.includes('ReceiptPercentIcon') ? pass('Change plan/Billing removed from overview') : fail('Change plan still in overview');
const vite_log = fs.existsSync('/tmp/mail_dev.log') ? fs.readFileSync('/tmp/mail_dev.log','utf8') : '';
vite_log.split('\n').filter(l=>l.includes('ENOENT')&&l.includes('.claude')).length===0 ? pass('Vite: no stale worktree errors') : fail('Vite has ENOENT errors');

await page.screenshot({ path: `${SHOTS}/99_final.png` });
await browser.close();

log('\n===== RESULTS =====');
const P=R.filter(r=>r.startsWith('PASS')).length, F=R.filter(r=>r.startsWith('FAIL')).length;
log(`PASS: ${P}   FAIL: ${F}`);
R.forEach(r => log(r));
log(`\nScreenshots: ${SHOTS}`);
if (F > 0) process.exit(1);
