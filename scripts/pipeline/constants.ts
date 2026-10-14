// §8 step 1: refresh constants. Online: OpenDota /constants/*. Offline: the
// `dotaconstants` npm package (same data OpenDota serves, pinned per release).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { RawItems } from './eligibility';
import { odFetch, readJson, writeJson } from './opendota';

const require = createRequire(import.meta.url);

export interface RawHero {
  id: number;
  name: string;
  localized_name: string;
  img?: string;
}
export interface RawPatch {
  id: number;
  name: string;
  date: string;
}

export interface Constants {
  items: RawItems;
  heroes: Record<string, RawHero>;
  patches: RawPatch[];
}

const SNAP_DIR = join(process.cwd(), 'data', 'cache', 'constants');

export async function loadConstants(offline: boolean): Promise<Constants> {
  if (offline) {
    const dir = join(dirname(require.resolve('dotaconstants')), 'build');
    const load = <T>(f: string) => readJson<T>(join(dir, f)) as T;
    return {
      items: load<RawItems>('items.json'),
      heroes: load<Record<string, RawHero>>('heroes.json'),
      patches: load<RawPatch[]>('patch.json'),
    };
  }
  const [items, heroes, patches] = await Promise.all([
    odFetch<RawItems>('/constants/items'),
    odFetch<Record<string, RawHero>>('/constants/heroes'),
    odFetch<RawPatch[]>('/constants/patch'),
  ]);
  const c = { items, heroes, patches };
  writeJson(join(SNAP_DIR, 'latest.json'), c, false);
  return c;
}

export function currentPatch(c: Constants): RawPatch {
  return c.patches[c.patches.length - 1];
}

/** Patch name for an OpenDota numeric patch id ("60" → "7.41"). */
export function patchName(c: Constants, id: number | undefined): string | null {
  return c.patches.find((p) => p.id === id)?.name ?? null;
}

/** Items snapshot saved per patch so the previous-patch fallback (S3) can diff items. */
export function saveItemSnapshot(patch: string, items: RawItems) {
  writeJson(join(SNAP_DIR, `items-${patch}.json`), items, false);
}
export function loadItemSnapshot(patch: string): RawItems | null {
  return readJson<RawItems>(join(SNAP_DIR, `items-${patch}.json`));
}
