// Capture screenshots of chapters/beats:  node build/shoot.mjs <outdir> <WxH> <spec...>
// spec: "chapterId:beat[:steps]" e.g. opening:0 concern:1:2  ; options via env: MOTION=full|calm|static, WAIT=ms
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/joynoinc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const [outdir, size, ...specs] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const motion = process.env.MOTION || 'full';
const wait = +(process.env.WAIT || 2600);
const url = (process.env.URL || 'http://127.0.0.1:5180/') + (motion !== 'full' ? '?' + motion + '=1' : '?full=1') + (process.env.PRESENT ? '&present=1' : '');
const browser = await chromium.launch({ executablePath: 'C:/Users/joynoinc/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DSF || 1) });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+(process.env.FIRST || 3500));
for (const spec of specs) {
  const [id, beat, steps] = spec.split(':');
  await page.evaluate(([id, beat]) => window.ESUGID.goTo(id, +beat, { instant: true }), [id, beat || 0]);
  await page.waitForTimeout(400);
  for (let k = 0; k < +(steps || 0); k++) { await page.evaluate(() => window.ESUGID.next()); await page.waitForTimeout(300); }
  await page.evaluate(() => window.ESUGID.world && window.ESUGID.world.settle());
  await page.waitForTimeout(wait);
  const name = `${outdir}/${W}x${H}-${motion}-${id}-${beat || 0}${steps ? '-s' + steps : ''}.png`;
  await page.screenshot({ path: name });
  const st = await page.evaluate(() => ({ c: window.ESUGID.state.chapter, b: window.ESUGID.state.beat, shot: window.ESUGID.state.shot, world: !!window.ESUGID.world }));
  console.log(name, JSON.stringify(st));
}
if (errors.length) console.log('CONSOLE:\n' + [...new Set(errors)].join('\n'));
await browser.close();
