// End-to-end checks for the E-sugid showcase.
//   node build/verify.mjs [baseUrl]      (default http://127.0.0.1:5180/ — start build/serve.mjs first)
// Static checks: unaltered screenshots, local-only references, chapter timing.
// Browser checks: console errors, WebGL, images, full keyboard walk-through, dialogs,
// presenter window sync, motion modes, file:// opening, narrow-screen overflow.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/joynoinc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const workspace = join(here, '..', '..');
const base = process.argv[2] || 'http://127.0.0.1:5180/';
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/* ---------------- static checks ---------------- */
const manifest = JSON.parse(readFileSync(join(here, 'screens-manifest.json'), 'utf8'));
let unaltered = 0, altered = [];
for (const [key, m] of Object.entries(manifest)) {
  const copy = join(dist, m.src), source = join(workspace, m.origin);
  if (existsSync(copy) && existsSync(source) && sha(copy) === sha(source)) unaltered++; else altered.push(key);
}
ok('screenshots are byte-identical to the supplied captures', altered.length === 0, `${unaltered}/${Object.keys(manifest).length}` + (altered.length ? ' altered: ' + altered.join(',') : ''));
const excluded = ['login.jpg', 'complaints-hearing-queue.png'];
ok('privacy-flagged captures are not shipped', excluded.every((f) => !existsSync(join(dist, 'assets/img/screens/mobile', f)) && !existsSync(join(dist, 'assets/img/screens/admin', f))));

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readFileSync(join(dist, 'assets/css/site.css'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).concat([...css.matchAll(/url\('?(\.\.\/[^')]+)'?\)/g)].map((m) => 'assets/css/' + m[1]));
const external = refs.filter((r) => /^(https?:)?\/\//.test(r));
const missing = refs.filter((r) => !/^(https?:|data:|mailto:)/.test(r)).filter((r) => !existsSync(join(dist, r.split('?')[0])));
ok('no external (CDN/network) references', external.length === 0, external.join(', '));
ok('every local reference exists', missing.length === 0, missing.join(', '));
const jsFiles = ['assets/js/deck.js', 'assets/js/world.js', 'assets/js/content.js', 'presenter.html'];
const netCalls = jsFiles.filter((f) => /fetch\(|XMLHttpRequest|firebase|googleapis/i.test(readFileSync(join(dist, f), 'utf8')));
ok('no calls to the live app backend or network APIs', netCalls.length === 0, netCalls.join(', '));
const times = [...html.matchAll(/class="chapter[^"]*" id="([^"]+)"[^>]*data-time="(\d+)"/g)];
const total = times.reduce((s, m) => s + +m[2], 0);
ok('defense plan fits 12–15 minutes', total >= 720 && total <= 900, `${times.length} chapters, ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);

/* ---------------- browser checks ---------------- */
const browser = await chromium.launch({ executablePath: 'C:/Users/joynoinc/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function openPage(url, viewport = { width: 1600, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}

// 1. desktop, full motion
{
  const { ctx, page, errors } = await openPage(base + '?full=1');
  const st = await page.evaluate(() => ({ world: !!(window.ESUGID && window.ESUGID.world), webgl: !!document.querySelector('#world.is-ready'), scrolly: document.documentElement.classList.contains('scrolly'), chapters: window.ESUGID.chapters.length }));
  ok('3D world initialises (WebGL)', st.world && st.webgl);
  ok('scroll-storytelling layout active on desktop', st.scrolly, `${st.chapters} chapters`);
  await page.evaluate(async () => { document.querySelectorAll('img').forEach((i) => (i.loading = 'eager')); await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))); });
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.getAttribute('src') && !i.naturalWidth).map((i) => i.getAttribute('src')));
  ok('all images load', broken.length === 0, broken.join(', '));

  // keyboard walk: → through every beat and sub-step to the end, recording visits
  await page.keyboard.press('Home'); await page.waitForTimeout(400);
  const visits = new Set(); let steps = 0, last = '';
  for (let k = 0; k < 140; k++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(170);
    const s = await page.evaluate(() => { const st = window.ESUGID.state; return st.chapter + ':' + st.beat; });
    visits.add(s); steps++;
    if (s === last && s.startsWith('13:1')) break;
    last = s;
    await page.waitForFunction(() => !window.ESUGID.isMoving(), null, { timeout: 8000 });
  }
  const beatsTotal = await page.evaluate(() => window.ESUGID.chapters.reduce((s, c) => s + c.beats.length, 0));
  ok('→ key reaches every beat in order', visits.size === beatsTotal, `${visits.size}/${beatsTotal} beats in ${steps} key presses`);
  for (let k = 0; k < 6; k++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250); }
  await page.waitForFunction(() => !window.ESUGID.isMoving(), null, { timeout: 8000 });
  const back = await page.evaluate(() => window.ESUGID.state.chapter);
  ok('← key steps backwards', back < 13, `now in chapter ${back}`);

  // number keys + steppers
  await page.keyboard.press('4'); await page.waitForTimeout(1500);
  await page.evaluate(() => window.ESUGID.goTo('concern', 1, { instant: true })); await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
  const route = await page.evaluate(() => document.querySelector('[data-stepper="route"] .is-on')?.dataset.step);
  ok('sub-steps advance inside a beat (concern routing)', route === 'lgu', 'route=' + route);
  await page.evaluate(() => window.ESUGID.goTo('assistant', 0, { instant: true })); await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(3500);
  const chat = await page.evaluate(() => [...document.querySelectorAll('.msg-q')].map((m) => m.textContent));
  ok('assistant replay shows the quick inquiries', chat.length === 2 && chat[1] === 'Can I submit a concern here?', chat.join(' | '));
  await page.waitForFunction(() => [...document.querySelectorAll('.msg-a button')].some((x) => /Open Concern/.test(x.textContent)), null, { timeout: 15000 }).catch(() => {});
  const nav = await page.evaluate(() => { const b = [...document.querySelectorAll('.msg-a button')].find((x) => /Open Concern/.test(x.textContent)); b && b.click(); return !!b; });
  await page.waitForFunction(() => !window.ESUGID.isMoving(), null, { timeout: 8000 }); await page.waitForTimeout(200);
  const afterNav = await page.evaluate(() => window.ESUGID.state.chapter + ':' + window.ESUGID.state.beat);
  ok('assistant “Open Concern” button navigates the presentation', nav && afterNav === '4:1', afterNav);

  // dialogs
  await page.keyboard.press('g'); await page.waitForTimeout(300);
  const chaptersOpen = await page.evaluate(() => document.getElementById('dlg-chapters').open && document.querySelectorAll('#chapter-list button').length);
  await page.keyboard.press('Escape');
  ok('chapter list (G)', chaptersOpen === 14, `${chaptersOpen} entries`);
  await page.keyboard.press('l'); await page.waitForTimeout(500);
  const lib = await page.evaluate(() => document.querySelectorAll('.lib-item').length);
  await page.click('.lib-item[data-key="a-alert-3"]'); await page.waitForTimeout(300);
  const shot = await page.evaluate(() => ({ open: document.getElementById('dlg-shot').open, title: document.getElementById('shot-title').textContent, src: document.getElementById('shot-img').getAttribute('src') }));
  ok('feature library lists every screen', lib === Object.keys(manifest).length, `${lib} items`);
  ok('library opens the full-size original', shot.open && /step 3/.test(shot.title) && shot.src.endsWith('alert-editor-step-03-audience-schedule.png'), shot.title);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  const nextShot = await page.evaluate(() => document.getElementById('shot-title').textContent);
  ok('lightbox arrows move between screens', nextShot !== shot.title, nextShot);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.evaluate(() => window.ESUGID.goTo('concern', 0, { instant: true })); await page.waitForTimeout(300);
  await page.click('#concern .beat.is-active .phone-screen img'); await page.waitForTimeout(300);
  const lb = await page.evaluate(() => document.getElementById('shot-title').textContent);
  ok('clicking a screenshot opens it full size', lb === 'Concern Center', lb);
  await page.keyboard.press('Escape');

  // defense mode, notes, presenter window
  await page.keyboard.press('p'); await page.waitForTimeout(300);
  const hud = await page.evaluate(() => !document.getElementById('hud').hidden && document.documentElement.dataset.present === '1');
  ok('defense mode shows the HUD and timer (P)', hud);
  await page.keyboard.press('n'); await page.waitForTimeout(200);
  const notes = await page.evaluate(() => !document.getElementById('notes').hidden && document.getElementById('notes-body').textContent.length > 40);
  ok('presenter notes toggle (N)', notes);
  await page.keyboard.press('n');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.keyboard.press('w')]);
  await popup.waitForLoadState('load'); await popup.waitForTimeout(1200);
  const title1 = await popup.evaluate(() => document.getElementById('title').textContent);
  await popup.click('[data-cmd="next"]'); await page.waitForTimeout(1600);
  const after = await page.evaluate(() => window.ESUGID.state.chapter + ':' + window.ESUGID.state.beat);
  const title2 = await popup.evaluate(() => document.getElementById('title').textContent + ' / ' + document.getElementById('step').textContent);
  ok('presenter window mirrors the deck and controls it', title1 === 'A concern becomes a case' && after === '4:1', `${title1} → ${title2} (deck ${after})`);
  await page.keyboard.press('b'); const black = await page.evaluate(() => !document.getElementById('blackout').hidden); await page.keyboard.press('b');
  ok('black screen (B)', black);
  ok('no console errors (desktop, full motion)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// 2. static and calm modes
{
  const { ctx, page, errors } = await openPage(base + '?static=1');
  const st = await page.evaluate(() => ({ scrolly: document.documentElement.classList.contains('scrolly'), canvas: getComputedStyle(document.getElementById('world-canvas')).display, beats: [...document.querySelectorAll('.beat .copy')].filter((c) => getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).opacity !== '0').length, total: document.querySelectorAll('.beat .copy').length }));
  ok('static mode: no 3D, every step visible in reading order', !st.scrolly && st.canvas === 'none' && st.beats === st.total, `${st.beats}/${st.total} steps visible`);
  ok('no console errors (static)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const m = await page.evaluate(() => document.documentElement.dataset.motion);
  ok('OS “reduce motion” starts in Calm mode', m === 'calm', m);
  await ctx.close();
}

// 3. opened straight from disk
{
  const { ctx, page, errors } = await openPage(pathToFileURL(join(dist, 'index.html')).href);
  const st = await page.evaluate(() => ({ world: !!(window.ESUGID && window.ESUGID.world), deck: !!(window.ESUGID && window.ESUGID.goTo) }));
  ok('works when index.html is opened directly (file://)', st.world && st.deck);
  ok('no console errors (file://)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// 4. narrow screens and projector sizes
for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  const { ctx, page, errors } = await openPage(base + '?full=1', vp);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  // for sticky layouts make sure the active copy fits its column
  const overflow = await page.evaluate(async () => {
    const bad = [];
    if (!document.documentElement.classList.contains('scrolly')) return bad;
    for (const c of window.ESUGID.chapters) for (let b = 0; b < c.beats.length; b++) {
      window.ESUGID.goTo(c.id, b, { instant: true });
      await new Promise((res) => setTimeout(res, 30));
      const copy = c.beats[b].querySelector('.copy:not(.sr-only)');
      if (copy && copy.scrollHeight > copy.clientHeight + 4) bad.push(c.id + ':' + b + ' (+' + (copy.scrollHeight - copy.clientHeight) + 'px)');
    }
    return bad;
  });
  ok(`${vp.width}×${vp.height}: no horizontal overflow`, r.sw <= r.iw, `${r.sw}px content in ${r.iw}px`);
  if (overflow.length) ok(`${vp.width}×${vp.height}: text fits without inner scrolling`, false, overflow.join(', '));
  else ok(`${vp.width}×${vp.height}: text fits without inner scrolling`, true);
  if (errors.length) ok(`${vp.width}×${vp.height}: no console errors`, false, errors[0]);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
