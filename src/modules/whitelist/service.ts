import { sql, redis } from '../../db';
import type { WhitelistEntry, CreateWhitelistDto, UpdateWhitelistDto, WhitelistType } from './types';

const WHITELIST_CACHE_KEY = "whitelist:list";
const CACHE_TTL = 300; // 5 minutes

export async function initWhitelistDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS api_whitelist (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Seed admin user IDs from env if provided
  const seeds: { type: WhitelistType; value: string; label: string }[] = [];

  if (process.env.TELEGRAM_ADMIN_ID) {
    seeds.push({
      type: 'telegram',
      value: process.env.TELEGRAM_ADMIN_ID.trim(),
      label: 'Telegram Admin (from ENV)',
    });
  }

  if (process.env.DISCORD_ADMIN_ID) {
    seeds.push({
      type: 'discord',
      value: process.env.DISCORD_ADMIN_ID.trim(),
      label: 'Discord Admin (from ENV)',
    });
  }

  for (const s of seeds) {
    await sql`
      INSERT INTO api_whitelist (type, value, label, enabled)
      VALUES (${s.type}, ${s.value}, ${s.label}, TRUE)
      ON CONFLICT (value) DO NOTHING
    `;
  }
}

export async function listWhitelist(): Promise<WhitelistEntry[]> {
  const cached = await redis.get(WHITELIST_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // cache corrupted
    }
  }

  const rows = await sql`
    SELECT id, type, value, label, enabled, created_at
    FROM api_whitelist
    ORDER BY id ASC
  `;

  const items = rows as unknown as WhitelistEntry[];
  await redis.set(WHITELIST_CACHE_KEY, JSON.stringify(items));
  await redis.expire(WHITELIST_CACHE_KEY, CACHE_TTL);
  return items;
}

export async function addWhitelist(dto: CreateWhitelistDto): Promise<WhitelistEntry> {
  const type = dto.type || 'telegram';
  const value = dto.value.trim();
  const label = (dto.label || '').trim();

  const rows = await sql`
    INSERT INTO api_whitelist (type, value, label, enabled)
    VALUES (${type}, ${value}, ${label}, TRUE)
    ON CONFLICT (value) 
    DO UPDATE SET type = EXCLUDED.type, label = EXCLUDED.label, enabled = TRUE
    RETURNING id, type, value, label, enabled, created_at
  `;

  await redis.del(WHITELIST_CACHE_KEY);
  return rows[0] as unknown as WhitelistEntry;
}

export async function updateWhitelist(id: number, dto: UpdateWhitelistDto): Promise<WhitelistEntry | null> {
  const fields = [];
  if (typeof dto.enabled === 'boolean') {
    fields.push(sql`enabled = ${dto.enabled}`);
  }
  if (dto.label !== undefined) {
    fields.push(sql`label = ${dto.label.trim()}`);
  }

  if (fields.length === 0) return null;

  const rows = await sql`
    UPDATE api_whitelist
    SET ${fields.reduce((p, c) => sql`${p}, ${c}`)}
    WHERE id = ${id}
    RETURNING id, type, value, label, enabled, created_at
  `;

  await redis.del(WHITELIST_CACHE_KEY);
  return (rows[0] as unknown as WhitelistEntry) || null;
}

export async function deleteWhitelist(idOrValue: number | string): Promise<boolean> {
  let rows;
  if (typeof idOrValue === 'number' || !isNaN(Number(idOrValue))) {
    const id = Number(idOrValue);
    rows = await sql`
      DELETE FROM api_whitelist
      WHERE id = ${id}
      RETURNING id
    `;
  } else {
    const val = String(idOrValue).trim();
    rows = await sql`
      DELETE FROM api_whitelist
      WHERE value = ${val}
      RETURNING id
    `;
  }

  await redis.del(WHITELIST_CACHE_KEY);
  return rows.length > 0;
}

/**
 * Validates if a user ID is whitelisted for a given bot platform (telegram or discord).
 * If no whitelist rules exist for the platform, access is open by default.
 */
export async function isUserWhitelisted(platform: 'telegram' | 'discord', userId: string | number): Promise<boolean> {
  const idStr = String(userId).trim();
  const entries = await listWhitelist();
  const platformRules = entries.filter((e) => e.enabled && e.type === platform);

  // If no whitelist rules configured for this platform, allow access
  if (platformRules.length === 0) {
    return true;
  }

  return platformRules.some((e) => e.value === idStr);
}

/**
 * Optional API key / IP check
 */
export async function isWhitelisted(clientIp: string, apiKey?: string | null): Promise<boolean> {
  const entries = await listWhitelist();
  const activeEntries = entries.filter((e) => e.enabled && (e.type === 'ip' || e.type === 'key'));

  if (activeEntries.length === 0) {
    return true;
  }

  if (apiKey) {
    const cleanKey = apiKey.trim();
    if (activeEntries.some((e) => e.type === 'key' && e.value === cleanKey)) {
      return true;
    }
  }

  if (clientIp) {
    const cleanIp = clientIp.trim();
    if (activeEntries.some((e) => e.type === 'ip' && e.value === cleanIp)) {
      return true;
    }
  }

  return false;
}
