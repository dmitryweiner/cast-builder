// Browser smoke of the real app: the sample model through every mode, its
// thumbnail, an STL opened from a file (a hollow print gets filled),
// Clayform's printable teapot, lid and "lid alongside" file, real downloads,
// the model turned and spun by a preset, language detection and memory, the
// panel as a sheet and no horizontal scroll on a phone, no console errors. With --preview it runs against a fresh
// production build and also checks that the app — the worker and its WASM
// included — works offline.
//
//   npm run smoke               # dev server
//   npm run smoke -- --preview  # production build + offline check
//   npm run smoke -- --shots    # also saves shots/<viewport>-<locale>.png
//
// Prints one line per step, with the time of each build; exits 1 on the
// first failed step or on any console error. New checks are new steps
// here, not new scripts.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, launch, parseArgs, VIEWPORTS } from './lib/harness.mjs';

const flags = parseArgs(process.argv.slice(2));
const preview = flags.has('preview');
const shots = flags.has('shots');
const app = await launch({ preview });
const fixture = (name) => resolve(import.meta.dirname, '../fixtures', `${name}.stl`);

async function step(name, fn) {
  app.label(name);
  const started = Date.now();
  await fn();
  console.log(`ok  ${name} (${Date.now() - started} ms)`);
}

/** Waits until the part list shows `count` parts (the preview has arrived). */
async function parts(page, count, timeout = 60000) {
  await page.waitForFunction((n) => document.querySelectorAll('#partList li').length === n, count, { timeout });
  return page.locator('#partList li').allTextContents();
}

/** How many pixels of the model thumbnail differ from its background — 0 is a blank picture. */
async function thumbPixels(page) {
  return page.evaluate(() => {
    const thumb = document.querySelector('#thumb');
    if (!(thumb instanceof HTMLCanvasElement) || thumb.width === 0) return 0;
    const copy = document.createElement('canvas');
    copy.width = thumb.width;
    copy.height = thumb.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(thumb, 0, 0);
    const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const [r, g, b] = data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 30) count++;
    }
    return count;
  });
}

/** Clicks a tab and waits for the parts of the new mode. */
async function mode(page, tab, count) {
  await page.click(tab);
  await page.waitForFunction(() => document.querySelectorAll('#partList li').length === 0, null, { timeout: 5000 }).catch(() => {});
  return parts(page, count);
}

try {
  await step('English by default, an empty stage invites a model', async () => {
    const { page, context } = await app.open({ locale: 'de-DE' });
    check((await page.locator('h1').textContent()) === 'Bring a ready piece', 'heading is not English');
    check(await page.locator('#empty').isVisible(), 'the empty stage is hidden');
    check(await page.locator('#exportBtn').isDisabled(), 'export is enabled without a model');
    await context.close();
  });

  await step('the sample teapot gets pour boxes, a master and a slump mold', async () => {
    const { page, context } = await app.open();
    await page.click('#exampleBtn');
    await page.waitForFunction(() => document.querySelector('#modelInfo')?.textContent?.startsWith('teapot'));
    check(!(await page.locator('#empty').isVisible()), 'the empty stage stays over the model');
    check(await page.locator('#thumb').isVisible(), 'no thumbnail of the model');
    await page.waitForFunction(() => document.querySelector('#thumb')?.width > 0);
    check((await thumbPixels(page)) > 1000, 'the thumbnail is blank');
    // the axes are labelled inside the picture, X running to the right of the axis
    const axes = await page.evaluate(() => {
      const box = document.querySelector('#thumbBox').getBoundingClientRect();
      return Object.fromEntries(
        ['X', 'Y', 'Z'].map((name) => {
          const label = document.querySelector(`#axis${name}`).getBoundingClientRect();
          const inside =
            label.width > 0 && label.left >= box.left && label.right <= box.right && label.top >= box.top && label.bottom <= box.bottom;
          return [name, { inside, x: label.left, y: label.top }];
        }),
      );
    });
    check(
      Object.values(axes).every((axis) => axis.inside),
      `axis labels outside the thumbnail: ${JSON.stringify(axes)}`,
    );
    check(axes.X.x > axes.Z.x && axes.Z.y < axes.X.y, `the axes are not X right, Z up: ${JSON.stringify(axes)}`);
    // the spout widens the piece: its bottom counts as narrow, two halves do
    const boxes = await parts(page, 2);
    check(boxes[0].startsWith('Pour box: half A'), `pour boxes: ${boxes.join(' | ')}`);
    check((await page.locator('#mouthNote').textContent()).startsWith('Mouth 120'), 'the mouth is not on the rim');
    check(!(await page.locator('#exportBtn').isDisabled()), 'export is disabled');
    const master = await mode(page, '#tabMaster', 1);
    check(master[0].startsWith('Master positive'), `master: ${master.join(' | ')}`);
    check(await page.locator('#mouthCard').isVisible(), 'the mouth card is hidden for the master');
    const slump = await mode(page, '#tabSlump', 1);
    check(slump[0].startsWith('Mold + punch'), `slump: ${slump.join(' | ')}`);
    check(!(await page.locator('#mouthCard').isVisible()), 'the mouth card is shown for the slump mold');
    check(await page.locator('#mold_slab').isVisible(), 'no slab slider in the slump mode');
    check(!(await page.locator('#mold_plaster').isVisible()), 'the plaster slider in the slump mode');
    await context.close();
  });

  await step('the mode survives a reload', async () => {
    const { page, context } = await app.open();
    await page.click('#tabMaster');
    await page.reload();
    check((await page.locator('#tabMaster').getAttribute('aria-selected')) === 'true', 'the mode was lost on reload');
    await context.close();
  });

  await step('a hollow cup opened from a file is filled; export downloads every part', async () => {
    const { page, context } = await app.open();
    await page.setInputFiles('#fileInput', fixture('cup-hollow'));
    // the cup bellies out a little: halves and a plate for its wide bottom
    await parts(page, 3);
    check((await page.locator('#warnings').textContent()).includes('was hollow'), 'no word about filling');
    await mode(page, '#tabMaster', 1);
    const downloads = [];
    page.on('download', (download) => downloads.push(download));
    await page.click('#exportBtn');
    await page.waitForFunction(() => !document.querySelector('#exportBtn')?.disabled, null, { timeout: 120000 });
    await page.waitForTimeout(500);
    check(downloads.length === 1, `${downloads.length} downloads instead of 1`);
    check(downloads[0].suggestedFilename() === 'cup-hollow-master.stl', `file named ${downloads[0].suggestedFilename()}`);
    const size = readFileSync(await downloads[0].path()).length;
    check(size > 84 + 50 * 1000, `the STL is only ${size} bytes`);
    await context.close();
  });

  await step("Clayform's printable files: the teapot fills, the lid asks to be turned, two pieces are refused", async () => {
    const { page, context } = await app.open();
    const panel = (selector, text) =>
      page.waitForFunction(([sel, words]) => document.querySelector(sel)?.textContent?.includes(words), [selector, text], {
        timeout: 60000,
      });
    await page.setInputFiles('#fileInput', fixture('teapot-hollow'));
    await panel('#warnings', 'was hollow');
    await page.setInputFiles('#fileInput', fixture('lid-printed'));
    await panel('#warnings', 'open at the bottom');
    await page.click('#turnFlip');
    await panel('#warnings', 'was hollow');
    await page.setInputFiles('#fileInput', fixture('teapot-lid-beside'));
    await panel('#blockers', 'separate pieces');
    // nothing to show in the view: it says why
    check((await page.locator('#stageNote').textContent()).includes('separate pieces'), 'the empty view gives no reason');
    check(await page.locator('#exportBtn').isDisabled(), 'export is enabled for two pieces');
    await context.close();
  });

  await step('a model that is not a solid is refused with a reason', async () => {
    const { page, context } = await app.open();
    const stl = readFileSync(fixture('pot'));
    // drop the last triangle: the mesh is open
    const count = stl.readUInt32LE(80) - 1;
    const open = Buffer.concat([stl.subarray(0, 80), Buffer.from(new Uint32Array([count]).buffer), stl.subarray(84, 84 + count * 50)]);
    await page.setInputFiles('#fileInput', { name: 'open.stl', mimeType: 'model/stl', buffer: open });
    await page.waitForFunction(() => document.querySelector('#blockers')?.textContent?.includes('not a closed solid'), null, {
      timeout: 60000,
    });
    check(await page.locator('#exportBtn').isDisabled(), 'export is enabled for a broken model');
    await context.close();
  });

  await step('turning the model changes its size, the mouth can be set by hand', async () => {
    const { page, context } = await app.open();
    await page.setInputFiles('#fileInput', fixture('vase'));
    await parts(page, 2);
    const before = await page.locator('#modelInfo').textContent();
    await page.click('#turnX');
    await page.click('#turnReset');
    await page.waitForFunction((text) => document.querySelector('#modelInfo')?.textContent === text, before);
    check((await page.locator('.preset-btn[aria-pressed="true"]').textContent()) === '0°', 'spin 0 is not pressed');
    await page.click('.preset-btn:text-is("90°")');
    check((await page.locator('#model_spin').inputValue()) === '90', 'the 90° preset did not spin the model');
    check((await page.locator('.preset-btn[aria-pressed="true"]').textContent()) === '90°', 'the 90° preset is not pressed');
    await page.click('#turnReset');
    await page.uncheck('#mouth_auto');
    check(await page.locator('#mouth_z').isVisible(), 'no mouth height slider');
    await page.selectOption('#mold_scheme', 'halves-bottom');
    await parts(page, 3);
    check((await page.locator('#schemeNote').textContent()).includes('by hand'), 'the scheme note does not say it was picked');
    await context.close();
  });

  await step('the browser language is detected, the choice survives a reload', async () => {
    const { page, context } = await app.open({ locale: 'ru-RU' });
    check((await page.locator('html').getAttribute('lang')) === 'ru', 'ru-RU browser did not get Russian');
    check((await page.locator('h1').textContent()) === 'Принесите готовое изделие', 'the heading is not Russian');
    await page.click('#exampleBtn');
    const boxes = await parts(page, 2);
    check(boxes[0].startsWith('Ванночка: половина A'), `parts are not Russian: ${boxes.join(' | ')}`);
    await page.selectOption('#locale', 'en');
    check((await page.locator('#partList li').first().textContent()).startsWith('Pour box'), 'parts did not switch to English');
    await page.reload();
    check((await page.locator('html').getAttribute('lang')) === 'en', 'the switcher choice was lost on reload');
    await context.close();
  });

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    for (const locale of ['en-US', 'ru-RU']) {
      await step(`no horizontal scroll on ${name} (${viewport.width}px, ${locale})`, async () => {
        const { page, context } = await app.open({ viewport, locale });
        await page.click('#exampleBtn');
        await parts(page, 2);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        check(width <= viewport.width, `page is ${width}px wide`);
        if (shots) await page.screenshot({ path: `shots/${name}-${locale}.png` });
        if (name === 'phone') {
          // the panel is a sheet: a tap on the view hides it, "Settings" brings it back
          check(!(await page.locator('#panelBtn').isVisible()), 'Settings shown over the open sheet');
          await page.locator('#view').click({ position: { x: 40, y: 40 } });
          await page.locator('#panelBtn').waitFor();
          await page.waitForFunction(() => document.querySelector('#panel')?.getBoundingClientRect().top >= innerHeight - 1);
          if (shots) await page.screenshot({ path: `shots/${name}-${locale}-closed.png` });
          await page.click('#panelBtn');
          check(await page.locator('#exportBtn').isVisible(), 'the sheet did not open again');
        } else {
          check(!(await page.locator('#panelBtn').isVisible()), 'Settings shown beside the panel');
        }
        await context.close();
      });
    }
  }

  if (preview) {
    await step('works offline after the first visit, the worker and its WASM too', async () => {
      const { page, context } = await app.open();
      await page.evaluate(() => navigator.serviceWorker.ready);
      // the first visit warms the cache; the worker chunk is in the precache list
      await page.reload();
      await context.setOffline(true);
      await page.reload();
      check((await page.locator('h1').textContent()) === 'Bring a ready piece', 'the app did not load offline');
      await page.click('#exampleBtn');
      await parts(page, 2);
      await context.close();
    });
  }

  check(app.errors.length === 0, `console errors:\n${app.errors.join('\n')}`);
  console.log(`smoke passed (${preview ? 'preview' : 'dev'})`);
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await app.close();
}
