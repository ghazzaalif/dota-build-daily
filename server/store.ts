// Storage for the Activity backend. PgStore is used in production (Neon Postgres);
// MemoryStore backs the tests and local runs without a database.
import type { DiscordUserLite } from '../src/discord/api';
import type { StoredGame } from './logic';

export interface BoardRow {
  user: DiscordUserLite;
  game: StoredGame;
}

export interface Store {
  init(): Promise<void>;
  upsertUser(u: DiscordUserLite): Promise<void>;
  addGuildMember(guildId: string, userId: string): Promise<void>;
  getGame(userId: string, date: string): Promise<StoredGame | null>;
  saveGame(g: StoredGame): Promise<void>;
  /** Games for `date` from everyone who has played in this server. */
  board(guildId: string, date: string): Promise<BoardRow[]>;
  games(userId: string): Promise<StoredGame[]>;
}

export class MemoryStore implements Store {
  users = new Map<string, DiscordUserLite>();
  members = new Map<string, Set<string>>();
  gamesByKey = new Map<string, StoredGame>();

  async init() {}
  async upsertUser(u: DiscordUserLite) {
    this.users.set(u.id, u);
  }
  async addGuildMember(guildId: string, userId: string) {
    if (!this.members.has(guildId)) this.members.set(guildId, new Set());
    this.members.get(guildId)!.add(userId);
  }
  async getGame(userId: string, date: string) {
    return this.gamesByKey.get(`${userId}:${date}`) ?? null;
  }
  async saveGame(g: StoredGame) {
    this.gamesByKey.set(`${g.userId}:${g.date}`, g);
  }
  async board(guildId: string, date: string) {
    const ids = [...(this.members.get(guildId) ?? [])];
    return ids
      .map((id) => ({ user: this.users.get(id)!, game: this.gamesByKey.get(`${id}:${date}`) }))
      .filter((r): r is BoardRow => !!r.user && !!r.game);
  }
  async games(userId: string) {
    return [...this.gamesByKey.values()].filter((g) => g.userId === userId);
  }
}

// Minimal structural type so this file doesn't need pg's types at compile time.
interface PgPool {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

interface GameRow {
  user_id: string;
  date: string;
  puzzle_no: number;
  rows: string[][];
  states: StoredGame['states'];
  status: StoredGame['status'];
  hints_revealed: number;
  early_reveals: number;
  lifeline: StoredGame['lifeline'];
}

const toGame = (r: GameRow): StoredGame => ({
  userId: r.user_id,
  date: r.date,
  puzzleNo: r.puzzle_no,
  rows: r.rows,
  states: r.states,
  status: r.status,
  hintsRevealed: r.hints_revealed,
  earlyReveals: r.early_reveals,
  lifeline: r.lifeline,
});

export class PgStore implements Store {
  constructor(private pool: PgPool) {}

  async init() {
    await this.pool.query(`
      create table if not exists users (
        id text primary key,
        username text not null,
        global_name text,
        avatar text,
        updated_at timestamptz not null default now()
      );
      create table if not exists guild_members (
        guild_id text not null,
        user_id text not null references users(id) on delete cascade,
        last_seen timestamptz not null default now(),
        primary key (guild_id, user_id)
      );
      create table if not exists games (
        user_id text not null references users(id) on delete cascade,
        date text not null,
        puzzle_no int not null,
        rows jsonb not null,
        states jsonb not null,
        status text not null,
        hints_revealed int not null default 0,
        early_reveals int not null default 0,
        lifeline jsonb,
        updated_at timestamptz not null default now(),
        primary key (user_id, date)
      );
      create index if not exists games_date on games(date);
    `);
  }

  async upsertUser(u: DiscordUserLite) {
    await this.pool.query(
      `insert into users (id, username, global_name, avatar) values ($1,$2,$3,$4)
       on conflict (id) do update set username=$2, global_name=$3, avatar=$4, updated_at=now()`,
      [u.id, u.username, u.globalName, u.avatar],
    );
  }

  async addGuildMember(guildId: string, userId: string) {
    await this.pool.query(
      `insert into guild_members (guild_id, user_id) values ($1,$2)
       on conflict (guild_id, user_id) do update set last_seen=now()`,
      [guildId, userId],
    );
  }

  async getGame(userId: string, date: string) {
    const { rows } = await this.pool.query<GameRow>('select * from games where user_id=$1 and date=$2', [userId, date]);
    return rows[0] ? toGame(rows[0]) : null;
  }

  async saveGame(g: StoredGame) {
    await this.pool.query(
      `insert into games (user_id, date, puzzle_no, rows, states, status, hints_revealed, early_reveals, lifeline)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (user_id, date) do update set rows=$4, states=$5, status=$6,
         hints_revealed=$7, early_reveals=$8, lifeline=$9, updated_at=now()`,
      [g.userId, g.date, g.puzzleNo, JSON.stringify(g.rows), JSON.stringify(g.states), g.status, g.hintsRevealed, g.earlyReveals, JSON.stringify(g.lifeline)],
    );
  }

  async board(guildId: string, date: string) {
    const { rows } = await this.pool.query<GameRow & { username: string; global_name: string | null; avatar: string | null }>(
      `select g.*, u.username, u.global_name, u.avatar
         from guild_members m
         join games g on g.user_id = m.user_id and g.date = $2
         join users u on u.id = m.user_id
        where m.guild_id = $1`,
      [guildId, date],
    );
    return rows.map((r) => ({ user: { id: r.user_id, username: r.username, globalName: r.global_name, avatar: r.avatar }, game: toGame(r) }));
  }

  async games(userId: string) {
    const { rows } = await this.pool.query<GameRow>('select * from games where user_id=$1', [userId]);
    return rows.map(toGame);
  }
}
