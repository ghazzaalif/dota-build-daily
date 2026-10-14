# Dota Build Wordle — Product Requirements (v1.1)

> **Status:** In development · **Owner:** Ghazza · **Last updated:** 2026-10-14
> **Working title:** _Dota Build Daily_ (final name TBD — see [Open Questions](#14-open-questions))

### Changelog

| Version | Date | Change |
|---|---|---|
| 1.1 | 2026-10-14 | **Answer is now the player's final inventory** (6 main slots at game end), ordered by purchase time, instead of the first 6 eligible purchases. Reason: answers must match what OpenDota/Dotabuff show on the match page. Affects §1, D2, new D5, §4, F6, F9, §5.3 example, S5, §7.3, §7.4, §9.3, §12, §13, §14 (Q7). Hosting moved to Render. |
| 1.0 | 2026-10-14 | Initial spec |

---

## Table of Contents

1. [Summary](#1-summary)
2. [Locked Decisions](#2-locked-decisions)
3. [Goals, Non-Goals & Success Metrics](#3-goals-non-goals--success-metrics)
4. [Glossary](#4-glossary)
5. [Game Rules](#5-game-rules)
6. [Feature Requirements (MVP)](#6-feature-requirements-mvp)
7. [Data Rules — Building the Answer](#7-data-rules--building-the-answer)
8. [Puzzle Pipeline](#8-puzzle-pipeline)
9. [Data Models](#9-data-models)
10. [Technical Architecture](#10-technical-architecture)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Edge Cases](#12-edge-cases)
13. [Milestones & Delivery Plan](#13-milestones--delivery-plan)
14. [Open Questions](#14-open-questions)
15. [Post-MVP Backlog](#15-post-mvp-backlog)
16. [Appendix](#16-appendix)

---

## 1. Summary

A daily web puzzle in the style of Wordle. Each day every player gets the same puzzle:

- One **hero**, played by a **pro player** in a **big tournament** match.
- The player has **6 attempts** to guess the **6 items that pro held in his main inventory when the match ended**, **ordered by when he bought each one**.
- After each guess, every item tile gets colored feedback (🟩 🟨 🟧 ⬛).
- Context hints unlock after each wrong row, so a casual player can work out the build from the draft.
- When the game ends, the player sees the final items with their purchase times and can share an emoji grid.

---

## 2. Locked Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Mechanic | **Full-build rows.** Each guess is a 6-item row; 6 rows max. |
| D2 | Order scoring | **Purchase order matters.** The 6 final items are ordered by purchase time. 🟩 = right item, right position · 🟨 = right item, wrong position |
| D3 | Audience | **Casual.** Generous hints, an item picker limited to valid items, a component hint (🟧), tooltips |
| D4 | Tournament scope | **Big events only:** The International, Esports World Cup (Riyadh), and Tier-1 premier events (see §7.1) |
| D5 | What the answer is | **Final inventory:** the 6 **main** inventory slots at game end (backpack and neutral slot ignored), so the answer matches the scoreboard on OpenDota/Dotabuff. Decided 2026-10-14 (v1.1). |

---

## 3. Goals, Non-Goals & Success Metrics

### Goals
- A fun daily ritual for Dota players that takes **3–5 minutes**.
- Teach players how pros adapt builds to a draft.
- Built-in virality through a shareable emoji grid.

### Non-Goals (MVP)
- User accounts, logins or a backend database
- Leaderboards
- Monetization
- Native mobile apps (mobile web only)
- Real-time or live-match puzzles

### Success Metrics (first 30 days after launch)

| Metric | Target | Why |
|---|---|---|
| Win rate (solved within 6 rows) | **60–80%** | Casual tuning: hard enough to feel earned, easy enough to come back |
| Average rows to solve | **4.0–4.8** | Same as above |
| Completion rate (started → finished) | ≥ 85% | Picker UX isn't too painful |
| Share-click rate (of finishers) | ≥ 15% | Growth loop is working |
| D7 return rate | ≥ 25% | Daily habit is forming |

---

## 4. Glossary

| Term | Meaning |
|---|---|
| **Puzzle** | One day's challenge: a hero, its match context, and a 6-item answer |
| **Final inventory** | The 6 main inventory slots (`item_0`–`item_5`) when the match ended. Backpack and neutral slots are not part of it. |
| **Answer / Build** | The 6 **eligible** items in the final inventory, ordered by purchase time |
| **Eligible item** | An item allowed in answers and in the picker (rules in §7.3) |
| **Row / Guess** | One submitted set of 6 distinct eligible items |
| **Slot** | Position 1–6 within a row (1 = the final item bought earliest) |
| **Hint** | Extra match context unlocked during play |
| **Shared component** | A significant sub-item two items have in common (rules in §5.3) |

---

## 5. Game Rules

### 5.1 Core loop
1. The player sees the hero, role and tournament.
2. The player fills a row with **6 distinct eligible items**, choosing the order.
3. On submit, each slot is scored (§5.2).
4. A hint unlocks after each unsolved row (§5.4).
5. The game ends when a row is all 🟩 (**win**) or after row 6 (**loss**).

### 5.2 Scoring (per slot)

Items are always distinct within the answer and within a guess, so Wordle's duplicate-letter edge cases don't apply.

```text
for slot i in 0..5:
  g = guess[i]
  if g == answer[i]                 -> GREEN   🟩
  else if g in answer               -> YELLOW  🟨
  else if sharesComponent(g, answer) -> ORANGE 🟧
  else                              -> GREY    ⬛
```

### 5.3 Shared-component rule (🟧)
- `sharesComponent(g, answer)` is true when guessed item `g` and **any** answer item share at least one **significant component**. Each item's own key counts as part of its tree, so guessing a component of an answer item (e.g. Maelstrom when the answer has Mjollnir) is 🟧.
- **Significant component:** any item in the recursive component tree (recipes excluded) with cost **≥ `SHARED_COMPONENT_MIN_COST`** (default **1,000 gold**), _or_ any intermediate item (a component that has components itself, e.g. Maelstrom, Perseverance, Kaya).
  - Examples: Mjollnir vs Maelstrom → 🟧 (Maelstrom). Desolator vs Black King Bar → 🟧 (Mithril Hammer is cost 1,600 and is significant).
  - When several components match, the tooltip names the most expensive one.
- **Casual aid:** tapping or hovering a 🟧 tile shows _"Shares **{component}** with an item in the build."_
- The threshold is a config value and gets tuned in playtesting (M3).

### 5.4 Hint schedule (casual)

| When | Unlocks |
|---|---|
| Start | Hero, role (Carry / Mid / Offlane / Soft Support / Hard Support), tournament name and stage, patch |
| After row 1 | **Draft:** allied heroes and enemy heroes |
| After row 2 | **Game result and duration** (e.g. "Won in 41:12") |
| After row 3 | **Player and team** (e.g. "Yatoro — Team Spirit") |
| After row 4 | **Price band per slot** (e.g. Slot 3: 3,500–4,500 gold) for slots not yet 🟩 |
| After row 5 | **Lifeline:** reveals the earliest unsolved slot's item, locked as 🟩 in row 6 |

- **Early reveal:** the player can tap "Reveal next hint" at any time. Hints revealed **early** (before their row unlocks them) are counted and shown in the share text (💡N).
- Hints never auto-reveal the answer except through the row-5 lifeline. An early-revealed lifeline locks its slot in every following row.

### 5.5 Guess input rules
- A row must contain **exactly 6 distinct eligible items** before Submit is enabled.
- The player can't submit a row identical to a previous row.
- **Keep greens** (default **on**, can be toggled): items confirmed 🟩 are pre-filled into the same slots of the next row. They stay editable.

---

## 6. Feature Requirements (MVP)

Priority: **P0** = MVP must-have · **P1** = MVP if time allows · **P2** = post-MVP

### F1. Daily puzzle loading — P0
- The client loads today's puzzle based on the **UTC date** (reset at **00:00 UTC = 07:00 WIB**).
- The puzzle number = days since launch day + 1.

**Acceptance criteria**
- [ ] Every user on the same UTC date gets the same puzzle.
- [ ] A new puzzle appears after 00:00 UTC without a manual refresh of the deploy.
- [ ] A countdown to the next puzzle shows on the end screen.
- [ ] If today's file is missing, the game shows the most recent puzzle with the banner "Today's puzzle is running late" and logs an error event.

### F2. Puzzle header — P0
- Shows the hero portrait and name, role label, tournament name and stage, patch, and puzzle #.

**Acceptance criteria**
- [ ] Renders correctly at a 360 px viewport width.
- [ ] Hidden hints show as locked placeholders with the condition that unlocks them ("Unlocks after guess 2").

### F3. Guess grid — P0
- 6 rows × 6 slots. Each slot shows the item icon; the slot number sits above column headers 1–6.
- Tiles flip in sequence on submit (Wordle-style, about 250 ms per tile, with reduced-motion support).

**Acceptance criteria**
- [ ] Colors follow §5.2 exactly. Unit tests cover every case in Appendix A.
- [ ] Each tile also shows a **symbol** (✓ / ↔ / ◐ / ✕) so it doesn't rely on color alone.
- [ ] A tooltip on 🟧 tiles names the shared component.

### F4. Item picker — P0
This replaces Wordle's keyboard.

- Shows **eligible items only**, grouped by shop category: Boots, Accessories, Support, Magical, Armor, Weapons, Artifacts.
- **Search** by name and by alias (e.g. "bkb", "aghs", "bf", "manta", "deso"), with a fuzzy match.
- Each item shows its icon, name and cost.
- Each item is shaded by its **best known state** (🟩 > 🟨 > 🟧 > ⬛), the same as Wordle keyboard coloring. ⬛ items are dimmed but stay selectable.
- Flow: tap an item to fill the next empty slot; tap a filled slot to select it, then move it left/right with arrow buttons (P0) or tap it again to remove it; drag a slot to reorder (P1).

**Acceptance criteria**
- [ ] Search returns a result for every alias in `item-rules.json` within 50 ms.
- [ ] An item already in the current row can't be added twice; it shows as "in row".
- [ ] Usable one-handed on mobile: tap targets ≥ 44 × 44 px.

### F5. Hints panel — P0
- Behaves as in §5.4, including early reveal and the hint counter.

**Acceptance criteria**
- [ ] Hints unlock at exactly the right row count.
- [ ] Early reveal asks for confirmation the first time only.
- [ ] The row-5 lifeline locks the revealed slot in row 6.

### F6. End screen — P0
- Shows win or loss, the rows used and hints used.
- Shows the **final inventory timeline:** the 6 answer items in purchase order, each with its purchase minute (e.g. `BKB — 18:42`). A line explains that items are ordered by when they were bought (Dotabuff lists the same items in the player's own slot arrangement).
- Shows match facts: teams, score or result, duration, and links to the match on **OpenDota** and **Dotabuff**.
- Includes a Share button (F7), a stats summary (F8) and the next-puzzle countdown.

**Acceptance criteria**
- [ ] The timeline order matches the answer exactly.
- [ ] Both external links open in a new tab and resolve to the correct match ID.
- [ ] Every item and time in the timeline matches the player's final items on the linked match pages.

### F7. Share — P0
- Copies the text below to the clipboard. On mobile it uses `navigator.share` when available.

```text
Dota Build Daily #42 — Anti-Mage (Carry)
4/6 💡2
🟨⬛⬛🟧⬛⬛
🟩🟨⬛🟨⬛⬛
🟩🟩🟨🟩🟧⬛
🟩🟩🟩🟩🟩🟩
https://<domain>
```

- A loss shows `X/6`.
- The share text must **not** contain item names (no spoilers).

**Acceptance criteria**
- [ ] The output matches this format byte for byte (snapshot test).
- [ ] A "Copied!" toast confirms the copy.

### F8. Stats & persistence — P0
- Everything is stored in `localStorage` with no account. Stored fields: played, win %, current streak, max streak, and a guess distribution (1–6, X).
- Game state for the current puzzle is saved, so a refresh or return keeps progress.

**Acceptance criteria**
- [ ] The streak breaks when a day is skipped or lost.
- [ ] If storage is unavailable (private mode), the game still works and shows the note "Stats won't be saved".
- [ ] A puzzle started before 00:00 UTC can be finished after reset. It counts toward its own date.

### F9. How-to-play onboarding — P0
- A modal opens on first visit and can be reopened with a "?" icon.
- It explains that the answer is the pro's final 6 items ordered by purchase time, the 4 tile states with one example row, the hint schedule, and what counts as an item (no consumables, upgraded boots only, main inventory only — backpack and neutral items don't count).

**Acceptance criteria**
- [ ] Shows automatically only once per browser.
- [ ] Can be read in under 30 seconds (≤ 120 words plus the example).

### F10. Settings — P1
- **Colorblind mode:** 🟩 → blue, 🟨 → orange, 🟧 → purple (share text adapts to match).
- Dark / light theme (follows the system by default).
- "Keep greens" toggle.
- Reduced motion (follows the system by default).

### F11. Analytics — P1
- A privacy-friendly tool (Plausible or Umami) with no cookies and no PII.
- Events: `puzzle_loaded`, `guess_submitted {row}`, `hint_revealed {hint, early}`, `puzzle_completed {win, rows, hints}`, `share_clicked`, `puzzle_missing`.

### F12. Footer / legal — P0
- The footer reads: _"Dota 2 is a registered trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve. Match data from OpenDota."_
- The site stays non-commercial.

---

## 7. Data Rules — Building the Answer

### 7.1 Tournament allowlist
Leagues come from a curated file, `data/leagues.json`, that is **edited by hand**. Nothing is auto-included, which keeps quality high.

Valve no longer runs "Majors", so **"Majors" means current Tier-1 premier events.**

| Include by default | Optional (decision needed) |
|---|---|
| The International | FISSURE Universe (Tier 1, but a smaller prize pool) |
| Esports World Cup (Riyadh) | Esports Nations Cup (Riyadh) |
| DreamLeague (ESL Pro Tour) | |
| ESL One (ESL Pro Tour) | |
| PGL Wallachia | |
| BLAST Slam | |

- **Confirmed OpenDota league IDs:** The International 2025 = `18324`, The International 2026 = `19719`. The others still need their IDs added.
- **Discovery aid:** the pipeline flags new OpenDota leagues with `tier = "premium"` for manual review. It never auto-adds them. Note: OpenDota currently marks only TI as "premium", so other Tier-1 events must be found by hand.
- **Main event only:** exclude qualifier leagues. They have separate league IDs.

### 7.2 Match & player selection filters

A candidate is one **(match, player)** pair. It must pass all of these:

| # | Filter | Rule |
|---|---|---|
| S1 | League | `leagueid` is in the allowlist |
| S2 | Parsed | `purchase_log` is present. If missing, request a parse (§8) and retry later. |
| S3 | Patch | Match patch = the **current patch**. Fallback: the previous patch, only if the current-patch pool has fewer than `MIN_POOL_SIZE` (default 30) candidates, and only if all 6 answer items still exist unchanged. |
| S4 | Duration | ≥ `MIN_DURATION_MIN` (default **25 min**) |
| S5 | Final inventory | All 6 **main** inventory slots hold **distinct eligible items** (§7.3), and each one appears in the purchase log. Any empty slot, ineligible item (Magic Wand, Gem, Bottle, dust, wards, plain boots…) or duplicate disqualifies the player. |
| S6 | Hero exclusions | Exclude **Lone Druid** (bear items mix into the log), **Meepo**, and **Arc Warden** (duplicated items cause confusion) |
| S7 | No repeats | Same hero not used in the last **14 days**; same match not used in the last **180 days** |
| S8 | Role mix (casual) | Weekly target: ~5 core puzzles (pos 1–3), at most 2 support puzzles (pos 4–5) |
| S9 | Abandons | Exclude matches with an abandon or disconnect flag (`leaver_status > 0` for any player) |

> **Pool size under S5 (M0 sample):** 9 TI 2026 playoff matches gave 26 valid candidates (vs 57 under the v1.0 first-6-purchases rule). Supports rarely qualify because they usually end holding a wand, dust or wards, so in practice support puzzles will be rare.

**Ranking among valid candidates** (picks the most "teachable" build):
1. Prefer a win by the player's team (a winning build is more satisfying to learn).
2. Prefer recognizable stages (playoffs and grand finals over group stage).
3. Randomize the rest with a seeded RNG (seed = target date), so results are reproducible.

### 7.3 Item eligibility

An item is **eligible** when **all** of these hold:

1. **Purchasable from the shop.** Excludes neutral items, Roshan drops (Aegis, Cheese, Refresher Shard, Aghanim's Blessing – Roshan) and Tormentor rewards. `item-rules.json` keeps a shop-category map that doubles as the "currently in the shop" list, because OpenDota constants still contain removed items.
2. **Not on the exclusion list:** consumables (Tango, Healing Salve, Clarity, Faerie Fire, Enchanted Mango, Smoke, Dust, Wards, Town Portal, Blood Grenade, Tome), Gem of True Sight, Bottle, Courier, and items consumed on purchase (**Aghanim's Shard**, **Aghanim's Blessing**) since they can never occupy an inventory slot.
3. **One of the following:**
   - **(a)** a recipe/assembled item with cost **≥ `MIN_ITEM_COST` (default 1,000)**, or
   - **(b)** **upgraded boots:** Power Treads, Phase, Arcane, Tranquil, Guardian Greaves, Boots of Bearing, Boots of Travel (levels 1 and 2). Plain Boots of Speed are **not** eligible.
   - **(c)** an entry on the **standalone allowlist:** Blink Dagger, plus any others added by hand in `item-rules.json`.

Consequences, so the rules are easy to explain:
- Magic Wand, Bracer, Wraith Band, Null Talisman, Soul Ring and Orb of Corrosion are **not** eligible (too cheap and early). A player still holding one at game end is skipped (S5).
- Moon Shard counts only if it is still held unconsumed in a main slot.

### 7.4 Building the answer from the final inventory
1. Read the player's final main inventory `item_0`–`item_5` (OpenDota item IDs) and map each ID to its item key via the item constants.
2. **Normalize level upgrades:** `dagon_2…5` → `dagon` and `travel_boots_2` → `travel_boots`.
3. **Validate (S5):** every slot is filled, every item is eligible, and no item appears twice after normalization. Otherwise the player is not a candidate.
4. **Time each item:** `timeSec` = the time of the **last** purchase of that exact item key in `purchase_log` (a sold-and-rebought item counts from the rebuy; Boots of Travel 2 is timed by the level-2 purchase). If there is no `purchase_log`, use `first_purchase_time` for that key. If the item isn't in either (e.g. it was picked up from the ground), the player is not a candidate.
5. **Order:** sort the 6 items by `timeSec`; ties go by original log index.
6. Answer = those 6 entries, each saved with `timeSec`.

> ✅ **Verified in M0:** `purchase_log` contains **completed** items (e.g. `black_king_bar`, `manta`, `hurricane_pike`), so purchase times come from it directly. The `first_purchase_time` fallback is implemented for matches without a log.

### 7.5 Role derivation
OpenDota has no reliable pos 1–5 field. The pipeline derives roles per team:

| Role | Rule |
|---|---|
| Carry (1) | `lane_role = 1` (safe lane) and the highest net worth in that lane |
| Mid (2) | `lane_role = 2` and the highest net worth in mid |
| Offlane (3) | `lane_role = 3` and the highest net worth in that lane |
| Soft Support (4) | The higher net worth of the 2 remaining players |
| Hard Support (5) | The lower net worth of the 2 remaining players |

- If the heuristic gives a conflict (no player in a lane, a tie, or a "support" out-farming a core by more than 25%), mark the candidate `needs_review` and skip it automatically.
- When `net_worth` is unavailable, GPM is used instead (same ordering within one match).
- **Fallback option:** the STRATZ API gives a `position` field directly. Use it if the heuristic proves unreliable in M0.

---

## 8. Puzzle Pipeline

```text
[GitHub Actions cron: daily 22:00 UTC]
   │
   ├─ 1. Refresh constants  → /constants/items, /constants/heroes, /constants/patch
   ├─ 2. Discover matches   → /leagues/{id}/matches for allowlisted leagues
   ├─ 3. Fetch details      → /matches/{id} for unseen matches (cached on disk)
   │       └─ no purchase_log → POST /request/{match_id}, retry next run
   ├─ 4. Build candidates   → apply §7.2–7.5 (final inventory + purchase times)
   ├─ 5. Fill the queue     → keep ≥ 7 days of future puzzles in a private queue
   ├─ 6. Validate           → schema check + every answer item exists in current constants
   └─ 7. Publish            → write tomorrow's puzzle to /public/puzzles/{date}.json → commit → deploy
```

**Requirements**
- **Rate limits:** the OpenDota free tier is about 60 requests/min and about 2,000/day. Throttle to ≤ 1 req/sec, use exponential backoff on 429 responses, and cache every match JSON so each match is fetched once.
- **Spoiler safety:** future puzzles live in a **private** location: a private repo when `QUEUE_REPO` is configured, otherwise the repository's GitHub Actions cache (not publicly readable). The public site only receives puzzles with `date ≤ tomorrow`.
- **Patch change:** when `/constants/patch` shows a new patch, invalidate queued puzzles from the old patch that fail rule S3 and refill the queue.
- **Monitoring:** a failed Action sends an email (GitHub's default). An alert also fires if the queue drops below 3 days.
- **Manual override:** a `data/overrides.json` file can pin a specific match/player to a date (e.g. TI grand final day), block a candidate, or label a game's stage.
- **Determinism:** running the pipeline twice for the same date produces the same puzzle. A rule change (like v1.1) requires clearing the queue so puzzles are rebuilt.

---

## 9. Data Models

### 9.1 `public/puzzles/{YYYY-MM-DD}.json`

```json
{
  "puzzleNo": 42,
  "date": "2026-11-25",
  "patch": "7.41e",
  "hero": { "id": 1, "key": "antimage", "name": "Anti-Mage" },
  "role": { "pos": 1, "label": "Carry" },
  "tournament": { "leagueId": 12345, "name": "The International 2026", "stage": "Grand Final" },
  "hints": {
    "allies":  [1, 86, 129, 26, 5],
    "enemies": [8, 74, 99, 30, 3],
    "result": "win",
    "durationSec": 2472,
    "player": { "name": "Yatoro", "team": "Team Spirit" },
    "priceBands": ["0-2000", "2000-3500", "3500-4500", "4500-5500", "5500+", "5500+"]
  },
  "match": { "matchId": 7890123456, "radiantTeam": "Team Spirit", "direTeam": "Gaimin Gladiators", "playerSide": "radiant" },
  "answer": "<obfuscated string>"
}
```

- `answer` decodes to `[{ "key": "power_treads", "timeSec": 512 }, …]` × 6, sorted by `timeSec`.
- `allies` includes the puzzle hero first, then the 4 teammates.
- **Obfuscation:** XOR + base64 with a key per puzzle. This stops casual spoilers in DevTools; it isn't real security, which is accepted for MVP.

### 9.2 `public/data/items.json` (snapshot per patch)

```json
{
  "black_king_bar": {
    "id": 116,
    "name": "Black King Bar",
    "cost": 4050,
    "category": "armor",
    "img": "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/black_king_bar.png",
    "aliases": ["bkb"],
    "components": ["mithril_hammer", "ogre_axe"],
    "significantComponents": ["mithril_hammer", "ogre_axe"],
    "eligible": true
  }
}
```

### 9.3 `data/item-rules.json` (hand-maintained)
- `exclude`: item keys that are never eligible (includes `aghanims_shard`, `ultimate_scepter_2`)
- `standaloneAllow`: e.g. `["blink"]`
- `upgradedBoots`: the list from §7.3(b)
- `levelNormalize`: `{ "dagon_2": "dagon", …, "travel_boots_2": "travel_boots" }`
- `categories`: item key → shop category (OpenDota constants don't include the shop tab)
- `aliases`: item key → `[strings]`

### 9.4 `localStorage` (client)

```json
{
  "dbd:v1:stats": { "played": 12, "wins": 9, "curStreak": 3, "maxStreak": 5, "dist": {"1":0,"2":1,"3":2,"4":4,"5":1,"6":1,"X":3}, "lastCompleted": "2026-11-25", "lastWin": "2026-11-25" },
  "dbd:v1:game:2026-11-25": { "rows": [["power_treads","..."]], "hintsRevealed": 2, "earlyReveals": 1, "lifeline": null, "status": "in_progress" },
  "dbd:v1:settings": { "colorblind": false, "keepGreens": true, "seenTutorial": true }
}
```

### 9.5 Config constants

| Key | Default | Purpose |
|---|---|---|
| `MAX_ROWS` | 6 | Attempts |
| `BUILD_SIZE` | 6 | Items per answer |
| `MIN_ITEM_COST` | 1000 | §7.3(a) |
| `SHARED_COMPONENT_MIN_COST` | 1000 | §5.3 |
| `MIN_DURATION_MIN` | 25 | §7.2 S4 |
| `MIN_POOL_SIZE` | 30 | §7.2 S3 |
| `HERO_COOLDOWN_DAYS` | 14 | §7.2 S7 |
| `MATCH_COOLDOWN_DAYS` | 180 | §7.2 S7 |
| `MAX_SUPPORT_PER_WEEK` | 2 | §7.2 S8 |
| `QUEUE_DAYS` | 7 | §8 |
| `QUEUE_ALERT_DAYS` | 3 | §8 |
| `PRICE_BAND_EDGES` | 2000, 3500, 4500, 5500 | §5.4 price bands |
| `RESET_UTC_HOUR` | 0 | F1 |
| `LAUNCH_DATE` | 2026-10-14 | F1 puzzle #1 |

---

## 10. Technical Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Vite + React + TypeScript** | Static SPA, no server needed |
| Styling | Tailwind CSS | Mobile-first |
| State | React state + a small `useGame` reducer | Pure scoring functions, unit-tested |
| Hosting | **Render static site** (free tier) | Auto-deploys on push to `main`, including the pipeline's daily puzzle commit |
| Pipeline | Node 20 + TypeScript scripts, run by GitHub Actions cron | `scripts/pipeline/*` |
| Data source | **OpenDota API** (primary), STRATZ (role fallback) | API key optional (raises the daily limit) |
| Images | Steam CDN (`cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/{items,heroes}/…`) | Lazy-loaded, with a text tile shown until the icon loads or if it fails |
| Tests | Vitest (unit), puppeteer-core browser smoke test | CI runs on every PR |

### Repo layout

```text
/src
  /components   Grid, ItemPicker, HintsPanel, EndScreen, Dialogs, Modal, GameScreen
  /game         scoring.ts, hints.ts, share.ts, storage.ts, date.ts, search.ts, game.ts
  /data         loaders for items/heroes/puzzle
/public
  /data         items.json, heroes.json
  /puzzles      YYYY-MM-DD.json (published only) + index.json
/scripts/pipeline
  run.ts  opendota.ts  constants.ts  eligibility.ts  answer.ts  roles.ts  candidates.ts  schedule.ts  publish.ts
/data           leagues.json  item-rules.json  overrides.json  cache/
/docs           this PRD
/.github/workflows  pipeline.yml  ci.yml
```

---

## 11. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | First load ≤ 2 s on 4G; JS bundle ≤ 200 KB gzipped; Lighthouse Performance ≥ 90 |
| Responsive | Works from 360 px to desktop. The picker is a bottom sheet on mobile and a side panel on desktop. |
| Accessibility | WCAG 2.1 AA contrast; tiles have symbols and `aria-label` ("Slot 2: Black King Bar, in build, wrong position"); full keyboard play |
| Browser support | Last 2 versions of Chrome, Safari (iOS), Firefox, Edge |
| Privacy | No cookies and no PII; analytics are aggregate only |
| Reliability | 99% of days have the puzzle live by 00:00 UTC |
| Offline | P2. After first load, today's puzzle is playable offline (service worker). |

---

## 12. Edge Cases

| Case | Expected behavior |
|---|---|
| Today's puzzle file is missing | F1 fallback banner + `puzzle_missing` event |
| A user plays across the UTC reset | They can finish the started puzzle; it counts for its own date. Then they're offered the new one. |
| Clock skew on the user's device | Use the date from the server's `Date` response header when it's available; otherwise the device clock |
| A patch renames or removes an item mid-queue | Pipeline validation (step 6) drops and replaces affected puzzles |
| A held item was bought more than once (sold and rebought) | Its time is the last purchase (§7.4 step 4) |
| A final-inventory item isn't in the purchase log (picked up, given by an ally) | Player is not a candidate (S5) |
| A core item ended in the backpack | Not part of the answer; only main slots count. If a main slot is then empty or ineligible, the player is skipped. |
| Player ends holding Magic Wand, Gem, dust, wards or plain boots | Not a candidate (S5) |
| A hero buys an item for a summon/illusion (e.g. Lone Druid) | Hero excluded (S6) |
| A guess includes an item from a newer or older patch | Impossible: the picker only lists items from the puzzle's `items.json` snapshot |
| localStorage is full or blocked | The game works without persistence and shows a note |
| Steam CDN image fails | Show a text tile with the item's short name |
| OpenDota is down during the pipeline run | Retry with backoff; the queue buffer (7 days) covers outages |

---

## 13. Milestones & Delivery Plan

### M0 — Data spike (validate feasibility)
- [ ] Pull 3 recent allowlisted leagues from OpenDota. _(TI 2026 playoffs imported: 9 matches.)_
- [x] **Verify `purchase_log` contents** and pick the strategy. _(Completed items present → `purchase_log`.)_
- [x] Implement the eligibility rules and generate `items.json`. _(101 eligible items on 7.41.)_
- [ ] Implement the role heuristic; check it by hand against 20 matches (≥ 90% correct, or switch to STRATZ). _(Implemented; hand check open.)_
- [ ] Generate 30 sample puzzles and review them by hand ("would a casual player find this fair?"). _(8 so far.)_

**Exit criteria:** ≥ 25 of 30 sample puzzles judged fair.

### M1 — Core game (P0 features F1–F9, F12)
- [x] Scoring engine and unit tests (Appendix A)
- [x] Grid, picker, hints, end screen, share, stats, onboarding
- [ ] Responsive layout and accessibility pass _(responsive done; formal WCAG audit open)_

**Exit criteria:** every P0 acceptance-criteria box is checked.

### M2 — Pipeline automation & launch infrastructure
- [x] GitHub Actions cron, private queue, publish step, alerts _(built; first unattended run pending)_
- [ ] Deploy to the hosting provider (Render); set up the domain
- [ ] 7-day buffer filled before launch

**Exit criteria:** the pipeline runs unattended for 7 days with zero missing puzzles.

### M3 — Playtest & tune
- [ ] 5–10 casual Dota players play 5 puzzles each.
- [ ] Tune `SHARED_COMPONENT_MIN_COST`, the hint order and `MIN_ITEM_COST` until the win rate lands at 60–80%. Final-inventory answers skew toward late, expensive items; watch whether that makes puzzles harder.
- [ ] Fix the top UX issues (expect most to be in the picker).

**Exit criteria:** the playtest win rate is within target, and no P0 bugs are open.

### M4 — Launch
- [ ] Post to r/DotA2, Dota Discord communities and X.
- [ ] Watch the metrics in §3 for 30 days.

---

## 14. Open Questions

| # | Question | Default if not decided |
|---|---|---|
| Q1 | Final product name and domain | "Dota Build Daily" on the Render subdomain until a domain is bought |
| Q2 | Global UTC reset vs. local-midnight reset | **UTC 00:00**: one puzzle number worldwide, simpler pipeline |
| Q3 | Include FISSURE Universe and Esports Nations Cup? | Exclude |
| Q4 | Allow support (pos 4–5) puzzles at all? | Yes, at most 2 per week (rare in practice under S5) |
| Q5 | Should the 🟧 tooltip name the component (easier) or just say "shares a component"? | Name it (casual) |
| Q6 | Use the OpenDota API key (paid) or the free tier? | Free tier + caching is enough for MVP |
| Q7 | Answer = first 6 purchases or final inventory? | **Resolved 2026-10-14: final inventory** (6 main slots, ordered by purchase time) |

---

## 15. Post-MVP Backlog

| Priority | Feature |
|---|---|
| P1 | Archive (play past puzzles, which don't count toward streaks) |
| P2 | Hard mode (no hints, no 🟧) |
| P2 | Unlimited practice mode (random past candidates) |
| P2 | Reverse mode: see the build, guess the hero |
| P2 | Offline play (PWA) |
| P2 | "First 6 purchases" as an alternate daily mode (the v1.0 rule) |
| P3 | Accounts plus a global leaderboard (needs a backend) |
| P3 | Localization (Bahasa Indonesia, Russian, Spanish, Portuguese) |

---

## 16. Appendix

### A. Scoring test cases

Answer: `[power_treads, battle_fury, manta, black_king_bar, butterfly, abyssal_blade]`

| Guess | Expected |
|---|---|
| `[power_treads, battle_fury, manta, black_king_bar, butterfly, abyssal_blade]` | 🟩🟩🟩🟩🟩🟩 (win) |
| `[battle_fury, power_treads, manta, black_king_bar, butterfly, abyssal_blade]` | 🟨🟨🟩🟩🟩🟩 |
| `[phase_boots, battle_fury, manta, desolator, butterfly, abyssal_blade]` | ⬛🟩🟩🟧🟩🟩. Phase is ⬛ (shares only Boots of Speed, see *). Desolator is 🟧 (shares Mithril Hammer with BKB). |
| `[power_treads, battle_fury, sange_and_yasha, black_king_bar, butterfly, abyssal_blade]` | 🟩🟩🟧🟩🟩🟩. Sange and Yasha shares Yasha (an intermediate item) with Manta. |
| `[power_treads, battle_fury, manta, black_king_bar, butterfly, euls]` | 🟩🟩🟩🟩🟩⬛. Eul's shares no significant component with any answer item.** |

\*Boots of Speed costs 500, which is below `SHARED_COMPONENT_MIN_COST`, so Phase vs Treads → **⬛**. This is intentional: otherwise every boot guess would light up 🟧.

\*\*Verified against patch 7.41 constants. Component trees change between patches; re-check these expected values on every patch. (On 7.41, Daedalus is Crystalys + Demon Edge, so Daedalus vs Desolator is ⬛, which is why the §5.3 example now uses BKB.)

### B. OpenDota endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /leagues` | Discover leagues (`leagueid`, `name`, `tier`) |
| `GET /leagues/{league_id}/matches` | Match list per league |
| `GET /matches/{match_id}` | Match details: `players[].item_0`–`item_5` (final inventory), `purchase_log`, `first_purchase_time`, `lane_role`, `net_worth`, `hero_id`, `win`, `duration`, `patch`, `picks_bans`, team names |
| `POST /request/{match_id}` | Request a replay parse when `purchase_log` is missing |
| `GET /constants/items`, `/constants/heroes`, `/constants/patch` | Static game data (item IDs map final-inventory slots to keys) |

### C. References
- OpenDota API docs: https://docs.opendota.com
- 2026 Tier-1 calendar (for the allowlist seed): https://www.esports.net/news/dota/dota-2-tournament-schedule
- Liquipedia tournament list: https://liquipedia.net/dota2/Tournament
