// Daily puzzle pipeline (PRD §8). Run by GitHub Actions at 22:00 UTC.
//
//   tsx scripts/pipeline/run.ts [--offline] [--no-fetch] [--today=YYYY-MM-DD] [--report]
//
//   --offline   constants from the pinned `dotaconstants` package instead of the API
//   --no-fetch  skip discovery/match fetching; build from data/cache only
//   --today     override "today" (UTC) — useful for backfills and tests
//   --report    print the candidate pool and rejections
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_POOL_SIZE, QUEUE_ALERT_DAYS, QUEUE_DAYS } from '../../src/config';
import { addDays, puzzleDateAt } from '../../src/game/date';
import { buildHeroesMap, loadHeroRules, writeClientData, writeHeroes, loadRules } from './build-items';
import { applyPatchRule, buildCandidates, type League } from './candidates';
import { currentPatch, loadConstants, loadItemSnapshot, patchName, saveItemSnapshot } from './constants';
import { componentsOf, type RawItems } from './eligibility';
import {
  applyDraftPatchRule,
  buildDraftCandidates,
  decodeDraftSecret,
  DRAFT_CACHE_DIR,
  hasDraft,
  loadAllDraftSources,
  pickDraftForDate,
  slimDraft,
  toDraftPuzzle,
  validateDraftPuzzle,
  type DraftHistoryEntry,
} from './draft';
import { blockedFor, buildLedger } from './ledger';
import {
  CACHE_DIR,
  getMatch,
  hasPurchaseLogs,
  odFetch,
  readJson,
  requestParse,
  writeJson,
  type ODLeagueMatch,
  type ODMatch,
} from './opendota';
import {
  loadDraftHistory,
  loadQueuedDraft,
  publishDraftsUpTo,
  queuedDraftDates,
  removeQueuedDraft,
  restoreDraftsFromPublic,
  saveDraftHistory,
  saveQueuedDraft,
  loadHistory,
  loadQueued,
  publishUpTo,
  queuedDates,
  removeQueued,
  restoreFromPublic,
  saveHistory,
  saveQueued,
  toPuzzle,
  validatePuzzle,
} from './publish';
import { pickForDate, type HistoryEntry } from './schedule';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const offline = flag('offline');
const noFetch = flag('no-fetch') || offline;
const today = opt('today') ?? puzzleDateAt(new Date());
const ROOT = process.cwd();

interface LeaguesFile {
  leagues: League[];
  reviewed?: number[];
}
interface Overrides {
  /** `mode` defaults to "build"; Draft pins use candidate IDs like "8960991322:radiant". */
  pin: { date: string; candidateId: string; mode?: 'build' | 'draft' }[];
  block: string[];
  stages: Record<string, string>;
}

/** Draft problems are reported the same way; the workflow still commits Build's puzzles. */
function alert(msg: string) {
  console.error(`::error::${msg}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ⚠️ ${msg}\n`);
  process.exitCode = 1;
}

async function main() {
  console.log(`Dota Build Daily pipeline — today ${today} (UTC)${offline ? ' [offline]' : ''}`);

  // 1. Refresh constants
  const c = await loadConstants(offline);
  const rules = loadRules();
  const patch = currentPatch(c).name;
  const prevPatch = c.patches[c.patches.length - 2]?.name ?? null;
  saveItemSnapshot(patch, c.items);
  const { items, heroes } = writeClientData(c, rules);
  console.log(`1. constants: patch ${patch}, ${Object.values(items).filter((i) => i.eligible).length} eligible items`);

  const leaguesFile = readJson<LeaguesFile>(join(ROOT, 'data', 'leagues.json'))!;
  const overrides = readJson<Overrides>(join(ROOT, 'data', 'overrides.json')) ?? { pin: [], block: [], stages: {} };

  // 2–3. Discover matches and fetch details
  const matches: ODMatch[] = [];
  if (!noFetch) {
    const all = await odFetch<{ leagueid: number; name: string; tier: string }[]>('/leagues');
    const reviewed = new Set([...(leaguesFile.reviewed ?? []), ...leaguesFile.leagues.map((l) => l.leagueId)]);
    const fresh = all.filter((l) => l.tier === 'premium' && !reviewed.has(l.leagueid));
    for (const l of fresh) console.log(`   ⚑ review: new premium league ${l.leagueid} "${l.name}" (not auto-added)`);
  }
  // Draft mode (Draft PRD §8): picks_bans comes with /matches, so no extra calls, except once
  // for cached explorer imports that never had it. Drafts don't need a parsed replay.
  const draftPath = (id: number) => join(DRAFT_CACHE_DIR, `${id}.json`);
  const keepDraft = (m: ODMatch) => {
    if (hasDraft(m) && !readJson<ODMatch>(draftPath(m.match_id))) writeJson(draftPath(m.match_id), slimDraft(m), false);
  };
  for (const league of leaguesFile.leagues) {
    const listFile = join(CACHE_DIR, 'leagues', `${league.leagueId}.json`);
    let list = readJson<ODLeagueMatch[]>(listFile) ?? [];
    if (!noFetch) {
      list = await odFetch<ODLeagueMatch[]>(`/leagues/${league.leagueId}/matches`);
      writeJson(listFile, list);
    }
    for (const lm of list) {
      const m = await getMatch(lm.match_id, noFetch);
      if (!m) continue;
      if (hasDraft(m)) keepDraft(m);
      else if (!noFetch && !readJson<ODMatch>(draftPath(m.match_id))) {
        const full = await odFetch<ODMatch>(`/matches/${m.match_id}`).catch(() => null);
        if (full) keepDraft(full);
      }
      if (!hasPurchaseLogs(m) && !noFetch) {
        await requestParse(m.match_id).catch((e) => console.warn(`   parse request failed: ${e}`));
        continue; // S2: retry next run
      }
      matches.push(m);
    }
  }
  const draftMatches = loadAllDraftSources().filter((m) => leaguesFile.leagues.some((l) => l.leagueId === m.leagueid));
  console.log(`2–3. matches: ${matches.length} cached with purchase logs, ${draftMatches.length} with drafts`);

  // 4c (Draft §7.5): typical positions from every cached draft on the current patch.
  const heroesWithPos = buildHeroesMap(c, loadHeroRules(), draftMatches);
  writeHeroes(heroesWithPos);
  Object.assign(heroes, heroesWithPos);

  // 4. Build candidates (§7.2–7.5)
  const { candidates, rejected } = buildCandidates(matches, {
    leagues: leaguesFile.leagues,
    raw: c.items,
    rules,
    currentPatch: patch,
    patchName: (id) => patchName(c, id),
    stageOverrides: overrides.stages,
    blocked: overrides.block,
  });
  const prevItems: RawItems | null = prevPatch ? loadItemSnapshot(prevPatch) : null;
  const unchanged = (key: string) =>
    !!prevItems?.[key] &&
    prevItems[key].cost === c.items[key]?.cost &&
    componentsOf(prevItems, key).join() === componentsOf(c.items, key).join();
  const { pool, usedFallback } = applyPatchRule(candidates, patch, prevPatch, MIN_POOL_SIZE, unchanged);
  console.log(
    `4. candidates: ${candidates.length} valid, ${rejected.length} rejected → pool ${pool.length}` +
      (usedFallback ? ` (includes ${prevPatch} fallback)` : '') +
      (pool.length < MIN_POOL_SIZE ? ` ⚠ below MIN_POOL_SIZE ${MIN_POOL_SIZE}` : ''),
  );
  if (flag('report')) {
    const byRule = rejected.reduce<Record<string, number>>((a, r) => ((a[r.rule] = (a[r.rule] ?? 0) + 1), a), {});
    console.log('   rejections by rule:', byRule);
    for (const p of pool)
      console.log(`   ${p.id.padEnd(22)} pos${p.pos} ${heroes[p.heroId]?.name.padEnd(18)} ${p.win ? 'W' : 'L'} ${p.stage}`);
  }

  // Patch change: drop queued puzzles that no longer pass S3 / validation, so they get refilled.
  for (const date of queuedDates()) {
    if (date <= addDays(today, 1)) continue; // never touch what's already public
    const q = loadQueued(date)!;
    const errs = validatePuzzle(q.puzzle, items, heroes);
    const stalePatch = q.puzzle.patch !== patch && !(usedFallback && q.puzzle.patch === prevPatch);
    if (errs.length || stalePatch) {
      console.log(`   ↺ dropping queued ${date}: ${stalePatch ? `patch ${q.puzzle.patch}` : errs.join('; ')}`);
      removeQueued(date);
    }
  }

  // 5. Fill the queue: keep ≥ QUEUE_DAYS of future puzzles (today .. today+QUEUE_DAYS)
  const draftFromPublic = restoreDraftsFromPublic();
  let draftHistory: DraftHistoryEntry[] = loadDraftHistory().filter((h) => loadQueuedDraft(h.date) || h.date <= addDays(today, 1));
  for (const h of draftFromPublic) if (!draftHistory.some((x) => x.date === h.date)) draftHistory.push(h);
  // D9 repair: a match already live in Draft wins over a Build puzzle that isn't public yet.
  const liveDraftMatches = new Set(draftFromPublic.map((h) => h.matchId));
  for (const date of queuedDates()) {
    if (date <= addDays(today, 1)) continue;
    if (liveDraftMatches.has(loadQueued(date)!.puzzle.match.matchId)) {
      console.log(`   ↺ dropping queued ${date}: match is already a published Draft puzzle (D9)`);
      removeQueued(date);
    }
  }

  const fromPublic = restoreFromPublic();
  let history: HistoryEntry[] = loadHistory().filter((h) => loadQueued(h.date) || h.date <= addDays(today, 1));
  for (const h of fromPublic) if (!history.some((x) => x.date === h.date)) history.push(h);
  const fillTo = addDays(today, QUEUE_DAYS);
  for (let d = today; d <= fillTo; d = addDays(d, 1)) {
    if (loadQueued(d)) continue; // determinism: an existing queued puzzle never changes
    const pin = overrides.pin.find((p) => p.date === d && (p.mode ?? 'build') === 'build');
    // Build reserves first (Draft §8); it only skips matches Draft has already scheduled (D9).
    const blocked = blockedFor('build', buildLedger(history, draftHistory));
    const choice = pin ? pool.find((x) => x.id === pin.candidateId) ?? null : pickForDate(pool, d, history, blocked);
    if (!choice) {
      alert(`No eligible candidate for ${d} — add leagues/matches or relax filters`);
      break;
    }
    const puzzle = toPuzzle(choice, d, items, heroes);
    // 6. Validate
    const errs = validatePuzzle(puzzle, items, heroes);
    if (errs.length) {
      alert(`Validation failed for ${d}: ${errs.join('; ')}`);
      break;
    }
    saveQueued({ puzzle, candidateId: choice.id });
    history = [...history.filter((h) => h.date !== d), { date: d, candidateId: choice.id, matchId: choice.matchId, heroId: choice.heroId, pos: choice.pos }];
    console.log(`5. queued ${d} #${puzzle.puzzleNo}: ${puzzle.hero.name} (${puzzle.role.label}) — ${choice.playerName}, ${choice.stage}`);
  }
  saveHistory(history);

  // 4b–5 (Draft): candidates, patch rule, queue
  const { candidates: draftCands, rejected: draftRejected } = buildDraftCandidates(draftMatches, {
    leagues: leaguesFile.leagues,
    currentPatch: patch,
    patchName: (id) => patchName(c, id),
    stageOverrides: overrides.stages,
    blocked: overrides.block,
    heroes,
  });
  const { pool: draftPool, usedFallback: draftFallback } = applyDraftPatchRule(draftCands, patch, prevPatch, MIN_POOL_SIZE);
  console.log(
    `4b. draft candidates: ${draftCands.length} valid, ${draftRejected.length} rejected → pool ${draftPool.length}` +
      (draftFallback ? ` (includes ${prevPatch} fallback)` : ''),
  );
  if (flag('report')) {
    const byRule = draftRejected.reduce<Record<string, number>>((a, r) => ((a[r.rule] = (a[r.rule] ?? 0) + 1), a), {});
    console.log('   draft rejections by rule:', byRule);
  }
  for (const date of queuedDraftDates()) {
    if (date <= addDays(today, 1)) continue;
    const q = loadQueuedDraft(date)!;
    const errs = validateDraftPuzzle(q.puzzle, heroes);
    const stalePatch = q.puzzle.patch !== patch && !(draftFallback && q.puzzle.patch === prevPatch);
    // D9 repair the other way: Build reserves first, so a not-yet-public Draft yields.
    const clash = history.some((h) => h.matchId === decodeDraftSecret(q.puzzle).match.matchId);
    if (errs.length || stalePatch || clash) {
      const why = clash ? 'match used by Build (D9)' : stalePatch ? `patch ${q.puzzle.patch}` : errs.join('; ');
      console.log(`   ↺ dropping queued draft ${date}: ${why}`);
      removeQueuedDraft(date);
      draftHistory = draftHistory.filter((h) => h.date !== date);
    }
  }
  for (let d = today; d <= fillTo; d = addDays(d, 1)) {
    if (loadQueuedDraft(d)) continue;
    const pin = overrides.pin.find((p) => p.date === d && p.mode === 'draft');
    const blocked = blockedFor('draft', buildLedger(history, draftHistory));
    const choice = pin
      ? draftPool.find((x) => x.id === pin.candidateId) ?? null
      : pickDraftForDate(draftPool, d, draftHistory.filter((h) => h.date !== d), blocked);
    if (!choice) {
      alert(`Draft: no eligible candidate for ${d} — add leagues/matches or relax filters`);
      break;
    }
    const puzzle = toDraftPuzzle(choice, d);
    const errs = validateDraftPuzzle(puzzle, heroes);
    if (errs.length) {
      alert(`Draft validation failed for ${d}: ${errs.join('; ')}`);
      break;
    }
    saveQueuedDraft({ puzzle, candidateId: choice.id, hiddenTeam: choice.hiddenTeam });
    draftHistory = [...draftHistory.filter((h) => h.date !== d), { date: d, candidateId: choice.id, matchId: choice.matchId, hiddenTeam: choice.hiddenTeam }];
    console.log(`5. queued draft ${d} #${puzzle.puzzleNo}: ${choice.hiddenTeam} (${choice.hiddenSide}) vs ${choice.enemyTeam}, ${choice.stage}`);
  }
  saveDraftHistory(draftHistory);

  // 7. Publish (spoiler-safe: only up to tomorrow)
  const published = publishUpTo(addDays(today, 1));
  console.log(`7. published: ${published.join(', ') || '(none)'}`);
  const publishedDrafts = publishDraftsUpTo(addDays(today, 1));
  console.log(`7. published drafts: ${publishedDrafts.join(', ') || '(none)'}`);

  const ahead = queuedDates().filter((d) => d > today).length;
  if (ahead < QUEUE_ALERT_DAYS) alert(`Queue low: only ${ahead} future day(s) queued`);
  else console.log(`   queue: ${ahead} future days`);
  const draftAhead = queuedDraftDates().filter((d) => d > today).length;
  if (draftAhead < QUEUE_ALERT_DAYS) alert(`Draft queue low: only ${draftAhead} future day(s) queued`);
  else console.log(`   draft queue: ${draftAhead} future days`);
}

main().catch((e) => {
  alert(String(e?.stack ?? e));
});
