// Generates public/data/items.json and heroes.json (PRD §9.2) from constants + item-rules.json.
// Usage: tsx scripts/pipeline/build-items.ts [--offline]
import { join } from 'node:path';
import type { HeroesMap, ItemsMap } from '../../src/game/types';
import { loadConstants, type Constants } from './constants';
import { buildItemsMap, type ItemRules } from './eligibility';
import { readJson, writeJson } from './opendota';

const HERO_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/';

export function loadRules(): ItemRules {
  const rules = readJson<ItemRules>(join(process.cwd(), 'data', 'item-rules.json'));
  if (!rules) throw new Error('data/item-rules.json missing');
  return rules;
}

export function buildHeroesMap(c: Constants): HeroesMap {
  const out: HeroesMap = {};
  for (const h of Object.values(c.heroes)) {
    const key = h.name.replace('npc_dota_hero_', '');
    out[h.id] = { id: h.id, key, name: h.localized_name, img: `${HERO_CDN}${key}.png` };
  }
  return out;
}

export function writeClientData(c: Constants, rules: ItemRules): { items: ItemsMap; heroes: HeroesMap } {
  const items = buildItemsMap(c.items, rules);
  const heroes = buildHeroesMap(c);
  writeJson(join(process.cwd(), 'public', 'data', 'items.json'), items);
  writeJson(join(process.cwd(), 'public', 'data', 'heroes.json'), heroes);
  return { items, heroes };
}

const isMain = process.argv[1]?.endsWith('build-items.ts');
if (isMain) {
  const offline = process.argv.includes('--offline');
  const c = await loadConstants(offline);
  const { items, heroes } = writeClientData(c, loadRules());
  const eligible = Object.values(items).filter((i) => i.eligible);
  console.log(`items.json: ${eligible.length} eligible items (+${Object.keys(items).length - eligible.length} components)`);
  console.log(`heroes.json: ${Object.keys(heroes).length} heroes`);
  const missing = Object.keys(loadRules().categories).filter((k) => !c.items[k]);
  if (missing.length) console.warn(`⚠ categories reference unknown items: ${missing.join(', ')}`);
}
