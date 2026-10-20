// Draft Daily E2E smoke test (Draft PRD M1). Same setup as smoke.mjs:
//   CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:4173/ node tests/e2e/draft-smoke.mjs [outDir]
// Plays today's draft: deep link → tutorial → board → banned hero disabled → two wrong rows →
// hints → solve → end screen + share text → reload persistence → Build tab still works.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173/').replace(/\/$/, '');
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
  return page.evaluate(async () => {
    const idx = await (await fetch('/puzzles/draft/index.json')).json();
    const today = new Date().toISOString().slice(0, 10);
    const date = idx.dates.includes(today) ? today : idx.dates[idx.dates.length - 1];
    const p = await (await fetch(`/puzzles/draft/${date}.json`)).json();
    const key = new TextEncoder().encode(`dbd:draft:${p.date}:${p.puzzleNo}`);
    const bin = atob(p.secret);
    const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ key[i % key.length]);
    return { puzzle: p, secret: JSON.parse(new TextDecoder().decode(bytes)) };
  });
}

async function run(viewport, label) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const mobile = viewport.width < 1024;

  // F10 deep link: /draft loads Draft mode directly.
  await page.goto(`${BASE}/draft`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[role=dialog][aria-label="How to play Draft"]');
  await page.screenshot({ path: `${OUT}/${label}-01-tutorial.png` });
  await page.click('[role=dialog] button ::-p-text(Start drafting)');

  const { puzzle, secret } = await decodeToday(page);
  const heroes = await page.evaluate(async () => (await fetch('/data/heroes.json')).json());
  const name = (id) => heroes[id].name;
  console.log(`[${label}] draft #${puzzle.puzzleNo} ${puzzle.hints.teams.hidden}: ${secret.answer.map(name).join(', ')}`);

  // F2: board shows 24 entries, hidden picks as ?1–?5, no horizontal scroll.
  const board = await page.$$eval('section[aria-label=Draft] ol > li', (els) => els.length);
  if (board < 4) fail(`board has ${board} phases`);
  const hiddenTiles = await page.$$eval('section[aria-label=Draft] [title^="Hidden pick"]', (els) => els.length);
  if (hiddenTiles !== 5) fail(`expected 5 hidden tiles, got ${hiddenTiles}`);
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (scrollX > 0) fail(`horizontal scroll of ${scrollX}px`);
  await page.screenshot({ path: `${OUT}/${label}-02-board.png`, fullPage: true });

  const openPicker = async () => {
    if (mobile && !(await page.$('[role=dialog][aria-label="Hero picker"]'))) {
      await page.click('button ::-p-text(Pick heroes)');
      await page.waitForSelector('[role=dialog][aria-label="Hero picker"]');
    }
  };
  const pick = async (id) => {
    await openPicker();
    const input = await page.$('input[placeholder^="Search"]');
    await input.click({ clickCount: 3 });
    await input.type(heroes[id].name.slice(0, 6));
    await page.click(`[aria-label="Hero picker"] button[aria-label^="${name(id).replace(/"/g, '\\"')}"]`);
  };
  const submit = async () => {
    if (mobile && (await page.$('[role=dialog][aria-label="Hero picker"]'))) {
      await page.click('[role=dialog][aria-label="Hero picker"] button ::-p-text(Submit)');
    } else {
      await page.click('main button ::-p-text(Submit)');
    }
    await sleep(2200);
  };

  // §5.4: a banned hero is shown but disabled.
  const banned = puzzle.draft.find((e) => e.type === 'ban').heroId;
  await openPicker();
  const input = await page.$('input[placeholder^="Search"]');
  await input.type(name(banned).slice(0, 6));
  const bannedDisabled = await page.$eval(`[aria-label="Hero picker"] button[aria-label^="${name(banned).replace(/"/g, '\\"')}"]`, (b) => b.disabled);
  if (!bannedDisabled) fail('banned hero is selectable');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (mobile) await page.click('[aria-label="Close hero picker"]');

  // Two wrong rows from available heroes outside the answer.
  const taken = new Set(puzzle.draft.filter((e) => e.heroId !== undefined).map((e) => e.heroId));
  const wrong = Object.keys(heroes)
    .map(Number)
    .filter((id) => !taken.has(id) && !secret.answer.includes(id))
    .slice(0, 10);
  // Row 1: four wrong heroes + one answer hero in the wrong slot (🟨).
  for (const id of [secret.answer[1], ...wrong.slice(0, 4)]) await pick(id);
  await submit();
  const row1 = await page.$$eval('[role=group][aria-label="Guess 1"] button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  if (!/in the team, wrong pick/.test(row1[0])) fail(`row 1 slot 1 should be yellow: ${row1[0]}`);
  if (!/not in the team/.test(row1[1])) fail(`row 1 slot 2 should be grey: ${row1[1]}`);
  // Positions hint is open after row 1.
  const posOpen = await page.$eval('#draft-hints-heading', (h) => h.closest('section').textContent);
  if (!/Pick 1/.test(posOpen) || /Unlocks after guess 1/.test(posOpen)) fail('positions hint did not unlock after row 1');

  for (const id of wrong.slice(5, 10)) await pick(id);
  await submit();
  const teamsOpen = await page.$eval('#draft-hints-heading', (h) => h.closest('section').textContent);
  if (!teamsOpen.includes(puzzle.hints.teams.hidden)) fail('teams hint did not unlock after row 2');
  await page.screenshot({ path: `${OUT}/${label}-03-two-rows.png`, fullPage: true });

  // Reload mid-game: rows persist (F8).
  await page.reload({ waitUntil: 'networkidle0' });
  const rowsAfterReload = await page.$$eval('[role=group][aria-label="Guess 2"] button', (bs) => bs.length);
  if (rowsAfterReload !== 5) fail('rows lost after reload');

  // Solve.
  for (const id of secret.answer) await pick(id);
  if (mobile) await page.screenshot({ path: `${OUT}/${label}-04-picker.png` });
  await submit();
  await page.waitForSelector('[role=dialog][aria-label="Solved in 3 rows"]', { timeout: 8000 });
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${label}-05-end.png`, fullPage: true });
  const endText = await page.$eval('[role=dialog]', (d) => d.textContent);
  for (const id of secret.answer) if (!endText.includes(name(id))) fail(`end screen misses ${name(id)}`);
  const link = await page.$eval('[role=dialog] a[href*="opendota.com/matches"]', (a) => a.href);
  if (!link.endsWith(String(secret.match.matchId))) fail(`bad OpenDota link ${link}`);

  // F7 share text, captured from the clipboard call.
  await page.evaluate(() => {
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => {
      window.__copied = t;
    };
  });
  await page.click('[role=dialog] button ::-p-text(Share result)');
  await sleep(300);
  const copied = await page.evaluate(() => window.__copied);
  console.log(`[${label}] share:\n${copied}`);
  if (!copied?.startsWith(`Dota Draft Daily #${puzzle.puzzleNo} — `)) fail('share header');
  if (!copied.includes('3/6 💡0')) fail('share score');
  for (const id of secret.answer) if (copied.includes(name(id))) fail('share leaks a hero name');
  if (copied.includes(puzzle.hints.teams.hidden)) fail('share leaks a team name');
  if (!copied.endsWith('https://dota-build-daily.onrender.com/draft')) fail('share url');

  // F10: tab shows ✓; switching to Build keeps Draft state and Build still loads.
  await page.keyboard.press('Escape');
  await sleep(200);
  const draftTab = await page.$eval('[role=tab][aria-selected=true]', (t) => t.getAttribute('aria-label'));
  if (!/Draft, finished today/.test(draftTab)) fail(`draft tab: ${draftTab}`);
  await page.click('[role=tab][href="/"]');
  await page.waitForSelector('[role=dialog][aria-label="How to play"]');
  if (new URL(page.url()).pathname !== '/') fail('build tab did not go to /');
  await sleep(500);
  await page.click('[role=dialog] button ::-p-text(Start guessing)');
  await page.waitForSelector('#guesses-heading');
  await page.screenshot({ path: `${OUT}/${label}-06-build-tab.png` });
  await page.goBack({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#draft-guesses-heading');
  const solvedRows = await page.$$eval('[role=group][aria-label="Guess 3"] button', (bs) => bs.filter((b) => /right hero, right pick/.test(b.getAttribute('aria-label'))).length);
  if (solvedRows !== 5) fail('draft state lost after switching tabs');

  // Stats stay separate.
  const ls = await page.evaluate(() => Object.keys(localStorage).sort());
  if (!ls.includes('dbd:draft:v1:stats')) fail('draft stats missing');
  if (ls.includes('dbd:v1:stats')) fail('build stats were touched by Draft');

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  console.log(`[${label}] OK`);
  await context.close();
}

try {
  await run({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile');
  await run({ width: 1280, height: 860 }, 'desktop');
  console.log('Draft smoke test passed');
} finally {
  await browser.close();
}
