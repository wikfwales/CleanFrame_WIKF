// AU8000 browser workflow and mocked public Tizen boundary; never contacts a TV.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdirSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';
const expected = ['youtube', 'primevideo', 'tvplus', 'whio', 'alexa', 'lookmovie', 'stremio'];
let count = 0;
function check(test, label) { assert.ok(test, label); count++; }
const calls = [];
let installed = [
  { id: 'AU8000.YouTube', name: 'YouTube' },
  { id: 'AU8000.Prime', name: 'Amazon Prime Video' },
  { id: 'AU8000.TVPlus', name: 'Samsung TV Plus' },
  { id: 'AU8000.Stremio', name: 'Stremio' }
];
let denied = false;
const tizen = {
  ApplicationControl: function (operation, uri) { this.operation = operation; this.uri = uri; },
  application: {
    getAppsInfo(ok) { ok(installed); },
    launch(id, ok, fail) { calls.push({ id }); denied ? fail({ name: 'SecurityError' }) : ok(); },
    launchAppControl(control, id, ok, fail) { calls.push({ control, id }); denied ? fail({ name: 'NotFoundError' }) : ok(); }
  }
};
const sandbox = { window: { tizen }, tizen, setTimeout, clearTimeout };
vm.runInNewContext(readFileSync(root + 'app/device.js', 'utf8'), sandbox);
const launch = id => new Promise(resolve => sandbox.window.FrameDevice.shortcut(id, resolve));
for (const [id, native] of [['youtube', 'AU8000.YouTube'], ['primevideo', 'AU8000.Prime'], ['tvplus', 'AU8000.TVPlus'], ['stremio', 'AU8000.Stremio']]) {
  check(!await launch(id) && calls.at(-1).id === native, id + ' resolves installed ID');
}
const before = calls.length;
check((await launch('whio')).message.includes('not installed') && calls.length === before, 'Missing WHIO does not launch a substitute');
check((await launch('alexa')).message.includes('no verified') && calls.length === before, 'Alexa explains unsupported direct launch');
check(!await launch('lookmovie'), 'Website app-control callback accepted');
check(calls.at(-1).control.uri === 'https://www.lookmovie2.to/' && calls.at(-1).control.operation.endsWith('/view') && calls.at(-1).id === null, 'HTTPS VIEW uses implicit browser resolution');
denied = true;
check((await launch('lookmovie')).detail.includes('NotFoundError'), 'Missing browser handler is reported');
check((await launch('youtube')).detail.includes('SecurityError'), 'Denied native launch is reported');
denied = false;
installed.push({ id: 'Other.YouTube', name: 'YouTube' });
const preAmbiguous = calls.length;
check((await launch('youtube')).message.includes('More than one') && calls.length === preAmbiguous, 'Ambiguous app names are not guessed');
const preview = await openPreview({ publicFonts: true });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(preview.baseURL + '/home/');
  await page.waitForFunction(() => window.ShoreQA && ShoreQA.state().committed && !ShoreQA.state().pending);
  const state = () => page.evaluate(() => ShoreQA.state());
  const act = action => page.evaluate(a => { assertAction(a); function assertAction(a) { if (!ShoreQA.activate(a)) throw Error('Unavailable action ' + a); } }, action);
  check(JSON.stringify((await state()).dock) === JSON.stringify(expected), 'Seven shortcuts in requested order on fresh profile');
  check(await page.locator('#photo').evaluate(e => e.complete && e.naturalWidth > 0), 'Wallpaper loaded');
  await page.evaluate(() => ShoreQA.look({ layout: 'grid' }));
  await page.waitForFunction(() => ShoreQA.state().committed.layout === 'grid');
  check(await page.locator('#homeGrid button').count() === 7, 'Seven grid shortcuts');
  await page.keyboard.press('ArrowDown');
  check((await state()).focusAction === 'home.app.whio', 'Grid Down moves three cells');
  await page.keyboard.press('ArrowRight');
  check((await state()).focusAction === 'home.app.alexa', 'Grid Right follows row');
  await page.keyboard.press('Enter');
  check(await page.getByText('Alexa has no verified direct app launch.', { exact: true }).count() === 1, 'Alexa guidance in real UI');
  await page.keyboard.press('Escape');
  await page.evaluate(() => ShoreQA.scene('editor'));
  await act('editor.move.youtube');
  await page.evaluate(() => ShoreQA.nav('down', 'ok'));
  check((await state()).dock[1] === 'youtube', 'Reorder persists');
  await act('editor.move.lookmovie');
  await page.evaluate(() => ShoreQA.nav('back', 'right', 'ok')); 
  check(!(await state()).dock.includes('lookmovie'), 'Website removable');
  await act('editor.add.lookmovie');
  check((await state()).dock.includes('lookmovie'), 'Website re-addable without TV discovery');
  await page.reload();
  await page.waitForFunction(() => window.ShoreQA && ShoreQA.state().committed);
  check((await state()).dock[1] === 'youtube' && (await state()).committed.layout === 'grid', 'Order and grid survive reload');
  for (const width of [1920, 1280]) {
    await page.setViewportSize({ width, height: width * 9 / 16 });
    check(await page.locator('#homeGrid').evaluate(e => { const r=e.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight; }), 'Grid fits ' + width);
  }
  mkdirSync(root + '.local/qa', { recursive: true });
  // Deliver screenshots of the requested defaults, independent of editing tests.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.ShoreQA && ShoreQA.state().committed && !ShoreQA.state().pending);
  await page.screenshot({ path: root + '.local/qa/au8000-dock.png' });
  await page.evaluate(() => ShoreQA.look({ layout: 'grid' }));
  await page.waitForFunction(() => ShoreQA.state().committed.layout === 'grid');
  await page.screenshot({ path: root + '.local/qa/au8000-grid.png' });
  check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
} finally { await preview.close(); }
console.log(count + ' AU8000 checks passed (browser and mocked API; no TV access).');
