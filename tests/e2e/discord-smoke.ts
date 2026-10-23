// End-to-end test of the Discord Activity against the fake host in discord-host.ts.
//   npm run test:discord   (CHROME_PATH must point at Chrome/Chromium)
// Two players in the same server: sign-in, uploads, server board, Discord share dialog,
// rich presence, image URL rewriting, and resuming on a second device.
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
import puppeteer, { type Frame, type Page } from 'puppeteer-core';
import { answerKey, decodeAnswer } from '../../src/game/answer';
import { puzzleDateAt } from '../../src/game/date';
import type { ItemsMap, Puzzle } from '../../src/game/types';
import { PLAYERS, server, store } from './discord-host';

const fail = (m: string): never => {
  throw new Error(m);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.argv[2] ?? 'discord-shots';

const today = puzzleDateAt(new Date());
const pub = join(HERE, '..', '..', 'public');
const puzzle = JSON.parse(readFileSync(join(pub, 'puzzles', `${today}.json`), 'utf8')) as Puzzle;
const items = JSON.parse(readFileSync(join(pub, 'data', 'items.json'), 'utf8')) as ItemsMap;
const ANSWER = decodeAnswer(puzzle.answer, answerKey(puzzle.date, puzzle.puzzleNo)).map((a) => a.key);
const WRONG = Object.keys(items).filter((k) => items[k].eligible && !ANSWER.includes(k)).slice(0, 6);

await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'], headless: true });

const requested: string[] = [];

async function open(as: string): Promise<{ page: Page; frame: Frame }> {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('request', (r) => requested.push(r.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e instanceof Error ? e.message : String(e)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/host.html?as=${as}`, { waitUntil: 'networkidle0' });
  const frame = page.frames().find((f) => f.url().includes('frame_id='))!;
  await frame.waitForSelector('nav', { timeout: 15000 });
  if (errors.length) fail(`page errors for ${as}: ${errors.join(' | ')}`);
  return { page, frame };
}

const cmds = (page: Page) => page.evaluate(() => (window as unknown as { __commands: { cmd: string; args: any }[] }).__commands);

async function playRow(frame: Frame, keys: string[]) {
  for (const k of keys) {
    const input = (await frame.$('[aria-label="Item shop"] input'))!;
    await input.click({ clickCount: 3 });
    await input.type(items[k].name);
    await frame.click(`[aria-label="Item shop"] button[aria-label^="${items[k].name.replace(/"/g, '\\"')},"]`);
  }
  await frame.click('main button ::-p-text(Submit)');
  await sleep(2600);
}

try {
  // Player A signs in and plays.
  const a = await open('a');
  const tut = await a.frame.$('[role=dialog] button ::-p-text(Start guessing)');
  if (tut) await tut.click();
  await sleep(500);
  const c1 = (await cmds(a.page)).map((c) => c.cmd);
  for (const need of ['AUTHORIZE', 'AUTHENTICATE']) if (!c1.includes(need)) fail(`missing ${need}: ${JSON.stringify((await cmds(a.page)).filter((c) => c.cmd === 'CAPTURE_LOG').map((c) => c.args))}`);
  if (!(await a.frame.$('#board-heading'))) fail('server board not shown');

  // Images point at the Steam CDN in the code; inside Discord they must go via /steam.
  if (!requested.some((u) => new URL(u).host === new URL(base).host && u.includes('/steam/apps/dota2/images/'))) fail(`item images were not routed through /steam: ${requested.filter((u) => /steam|images|\.png/.test(u)).slice(0, 4).join(' ')}`);
  const direct = requested.filter((u) => /steamstatic\.com|fonts\.(googleapis|gstatic)\.com/.test(u));
  if (direct.length) fail(`requests escaped the proxy: ${direct.slice(0, 3).join(', ')}`);

  await playRow(a.frame, WRONG);
  let g = await store.getGame(PLAYERS.a.id, today);
  if (g?.rows.length !== 1) fail(`server should have 1 row for A, has ${g?.rows.length}`);
  await playRow(a.frame, ANSWER);
  await a.frame.waitForSelector('[role=dialog][aria-label^="Solved in 2"]', { timeout: 8000 });
  g = await store.getGame(PLAYERS.a.id, today);
  if (g?.status !== 'won') fail(`server status ${g?.status}`);

  // Share goes through Discord's share dialog with the emoji grid.
  await a.frame.click('button ::-p-text(Share result)');
  await sleep(400);
  const share = (await cmds(a.page)).find((c) => c.cmd === 'SHARE_LINK');
  if (!share?.args.message.startsWith(`Dota Build Daily #${puzzle.puzzleNo}`)) fail(`share: ${JSON.stringify(share)}`);
  for (const k of ANSWER) if (share!.args.message.includes(items[k].name)) fail('share leaks an item name');
  const presence = (await cmds(a.page)).filter((c) => c.cmd === 'SET_ACTIVITY').pop();
  if (!presence?.args.activity.state?.includes('Solved in 2/6')) fail(`presence: ${JSON.stringify(presence?.args)}`);
  // The end screen's board lists A as the winner.
  await sleep(500);
  const endBoard = await a.frame.$eval('[role=dialog]', (d) => d.textContent ?? '');
  if (!endBoard.includes('Played in this server today') || !endBoard.includes('Ghazza')) fail('end screen board missing');
  // The bot isn't in this (fake) server: the end screen says so and links to adding it.
  await a.frame.waitForSelector('[role=dialog] button ::-p-text(Add the bot to this server)', { timeout: 5000 });
  await a.frame.click('[role=dialog] button ::-p-text(Add the bot to this server)');
  await sleep(300);
  const ext = (await cmds(a.page)).filter((c) => c.cmd === 'OPEN_EXTERNAL_LINK').pop();
  if (!ext?.args.url.includes('guild_id=900000000000000001') || !ext.args.url.includes('scope=bot')) fail(`bot install link: ${JSON.stringify(ext)}`);
  await a.page.screenshot({ path: `${OUT}/discord-a-end.png` });
  console.log('✓ player A: sign-in, uploads, win, share dialog, presence, image proxy');

  // Player B opens the Activity in the same server and sees A's result.
  const b = await open('b');
  const tutB = await b.frame.$('[role=dialog] button ::-p-text(Start guessing)');
  if (tutB) await tutB.click();
  await sleep(1500);
  const boardB = await b.frame.$eval('section[aria-labelledby=board-heading]', (s) => s.textContent ?? '');
  if (!boardB.includes('Ghazza') || !boardB.includes('2/6')) fail(`B's board: ${boardB}`);
  if (!boardB.includes('Friend') || !boardB.includes('(you)')) fail(`B should be listed as playing: ${boardB}`);
  for (const k of ANSWER) if (boardB.includes(items[k].name)) fail('board leaks an item name');
  await b.frame.$eval('section[aria-labelledby=board-heading]', (s) => s.scrollIntoView());
  await b.page.screenshot({ path: `${OUT}/discord-b-board.png` });
  console.log('✓ player B: sees A on the server board, colors only');

  // A on a second device (fresh browser storage) resumes the finished game.
  const a2 = await open('a');
  await a2.frame.waitForSelector('[role=dialog][aria-label^="Solved in 2"]', { timeout: 8000 });
  console.log('✓ player A, second device: finished game restored from the server');
  console.log('Discord Activity smoke test passed');
} finally {
  await browser.close();
  server.close();
}
