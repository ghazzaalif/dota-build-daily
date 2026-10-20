// E2E smoke test (PRD §10: Playwright smoke). Uses puppeteer-core + a Chromium path so it
// runs anywhere: CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:4173 node tests/e2e/smoke.mjs [outDir]
// Starts on the landing page ("/"), follows its Play button to /play, then plays today's puzzle: tutorial → two wrong rows → hint checks → solve → share → reload persistence.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.argv[2] ?? 'e2e-shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  headless: true,
});

const fail = (m) => {
  throw new Error(m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function decodeToday(page) {
  // Read the published puzzle and decode its answer the same way the client does.
  return page.evaluate(async () => {
    const idx = await (await fetch('/puzzles/index.json')).json();
    const today = new Date().toISOString().slice(0, 10);
    const date = idx.dates.includes(today) ? today : idx.dates[idx.dates.length - 1];
    const p = await (await fetch(`/puzzles/${date}.json`)).json();
    const key = new TextEncoder().encode(`dbd:${p.date}:${p.puzzleNo}`);
    const bin = atob(p.answer);
    const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ key[i % key.length]);
    return { puzzle: p, answer: JSON.parse(new TextDecoder().decode(bytes)) };
  });
}

async function run(viewport, label) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  // Landing page at "/": renders, has no errors, and its Play button opens the game at /play.
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.lp h1');
  const h1 = await page.$eval('.lp h1', (e) => e.textContent);
  if (!/Read the draft/i.test(h1)) fail(`landing h1: ${h1}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`landing overflows by ${overflow}px`);
  await page.screenshot({ path: `${OUT}/${label}-00-landing.png`, fullPage: true });
  await page.click('.lp-hero .lp-btn.gold');
  if (new URL(page.url()).pathname !== '/play') fail(`landing CTA went to ${page.url()}`);


  // F9: tutorial shows on first visit.
  await page.waitForSelector('[role=dialog][aria-label="How to play"]');
  await page.screenshot({ path: `${OUT}/${label}-01-tutorial.png` });
  await page.click('[role=dialog] button ::-p-text(Start guessing)');

  const { puzzle, answer } = await decodeToday(page);
  const items = await page.evaluate(async () => (await fetch('/data/items.json')).json());
  const name = (k) => items[k].name;
  console.log(`[${label}] puzzle #${puzzle.puzzleNo} ${puzzle.hero.name}: ${answer.map((a) => a.key).join(', ')}`);

  const mobile = viewport.width < 1024;
  const pick = async (query, key) => {
    const input = await page.$('input[placeholder^="Search"]');
    await input.click({ clickCount: 3 });
    await input.type(query);
    await page.click(`[aria-label="Item shop"] button[aria-label^="${name(key).replace(/"/g, '\\"')},"]`);
  };
  const fillRow = async (keys, queries = keys.map((k) => name(k))) => {
    if (mobile) {
      await page.click('button ::-p-text(Open shop)');
      try {
        await page.waitForSelector('[role=dialog][aria-label="Item shop"] input', { timeout: 3000 });
        await sleep(300); // let the sheet's slide-in animation finish before clicking
      } catch (e) {
        await page.screenshot({ path: `${OUT}/${label}-debug-shop.png` });
        throw e;
      }
    }
    for (let i = 0; i < keys.length; i++) await pick(queries[i], keys[i]);
  };
  const submit = async () => {
    if (mobile) await page.click('[role=dialog][aria-label="Item shop"] button ::-p-text(Submit)');
    else await page.click('main button ::-p-text(Submit)');
    await sleep(2400);
  };

  // Row 1: all wrong-ish — uses aliases to exercise search (F4).
  const decoys = ['black_king_bar', 'desolator', 'mjollnir', 'sange_and_yasha', 'greater_crit', 'butterfly', 'radiance', 'assault', 'satanic', 'skadi', 'abyssal_blade', 'monkey_king_bar'];
  const answerKeys = answer.map((a) => a.key);
  const row1 = decoys.filter((k) => !answerKeys.includes(k)).slice(0, 6);
  const aliasOf = { black_king_bar: 'bkb', desolator: 'deso', greater_crit: 'daed', monkey_king_bar: 'mkb', sange_and_yasha: 'sny', assault: 'ac' };
  await fillRow(row1, row1.map((k) => aliasOf[k] ?? name(k)));
  if (mobile) await page.screenshot({ path: `${OUT}/${label}-02-shop-sheet.png` });
  await submit();
  const tiles1 = await page.$$eval('[aria-label="Guess 1"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
  if (tiles1.length !== 6) fail(`row 1 has ${tiles1.length} tiles`);
  if (!tiles1.every((t) => /in the build|right slot|shares|not in the build/.test(t))) fail(`bad tile labels ${tiles1}`);

  // Hint 1 (draft) unlocked after row 1.
  const draftOpen = await page.$eval('section[aria-labelledby=hints-heading]', (s) => s.textContent.includes('His team'));
  if (!draftOpen) fail('draft hint not unlocked after row 1');

  // Row 2: right items in the wrong order (reversed) → expect yellows.
  await fillRow([...answerKeys].reverse());
  await submit();
  const tiles2 = await page.$$eval('[aria-label="Guess 2"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
  if (!tiles2.some((t) => t.includes('wrong slot'))) fail('expected yellow tiles in row 2');
  await page.screenshot({ path: `${OUT}/${label}-03-two-rows.png`, fullPage: true });

  // Keep greens: greens from row 2 are pre-filled into row 3.
  // Clear and play the real build.
  await page.click('main button ::-p-text(Clear row)');
  await fillRow(answerKeys);
  await submit();
  await page.waitForSelector('[role=dialog][aria-label^="Solved in 3"]', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/${label}-04-end.png` });

  // F6: timeline order and links.
  const timeline = await page.$$eval('ol[aria-label^="Final inventory"] li', (li) => li.map((l) => l.textContent));
  answerKeys.forEach((k, i) => !timeline[i].includes(name(k)) && fail(`timeline slot ${i + 1} wrong: ${timeline[i]}`));
  const hrefs = await page.$$eval('a[target=_blank]', (a) => a.map((x) => x.href));
  if (!hrefs.includes(`https://www.opendota.com/matches/${puzzle.match.matchId}`)) fail('OpenDota link');
  if (!hrefs.includes(`https://www.dotabuff.com/matches/${puzzle.match.matchId}`)) fail('Dotabuff link');

  // F7: share copies text without item names.
  await page.evaluate(() => {
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => (window.__copied = t);
  });
  await page.click('button ::-p-text(Share result)');
  await sleep(200);
  const shared = await page.evaluate(() => window.__copied);
  if (!shared?.startsWith(`Dota Build Daily #${puzzle.puzzleNo} — ${puzzle.hero.name} (${puzzle.role.label})\n3/6 💡0\n`)) fail(`share text: ${shared}`);
  answerKeys.forEach((k) => shared.includes(name(k)) && fail('share text leaks item name'));
  console.log(`[${label}] share:\n${shared}`);

  // F8: reload keeps the finished game and stats.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[role=dialog][aria-label^="Solved in 3"]', { timeout: 5000 });
  const played = await page.$eval('[role=dialog]', (d) => d.textContent.includes('Played'));
  if (!played) fail('stats missing after reload');
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/${label}-05-finished-board.png`, fullPage: true });

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  await context.close();
  console.log(`[${label}] ✓ passed`);
}

try {
  await run({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile');
  await run({ width: 1280, height: 860, deviceScaleFactor: 1 }, 'desktop');
} finally {
  await browser.close();
}
