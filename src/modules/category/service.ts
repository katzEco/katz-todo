import { sql, redis } from '../../db';
import type { Category, CategoryWithCount } from './types';

const CATEGORY_CACHE_KEY = "category:list";
const CACHE_TTL = 300; // 5 minutes

export async function initCategoryDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Seed default categories
  const defaults = ['general', 'work', 'personal', 'urgent'];
  for (const name of defaults) {
    await sql`
      INSERT INTO categories (name)
      VALUES (${name})
      ON CONFLICT (name) DO NOTHING
    `;
  }
}

export async function listCategories(): Promise<CategoryWithCount[]> {
  const cached = await redis.get(CATEGORY_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // invalid cache
    }
  }

  const rows = await sql`
    SELECT 
      c.id, 
      c.name, 
      c.created_at,
      COUNT(t.id)::int AS todo_count
    FROM categories c
    LEFT JOIN todo_items t ON LOWER(t.category) = LOWER(c.name)
    GROUP BY c.id, c.name, c.created_at
    ORDER BY c.id ASC
  `;

  const items = rows as unknown as CategoryWithCount[];
  await redis.set(CATEGORY_CACHE_KEY, JSON.stringify(items));
  await redis.expire(CATEGORY_CACHE_KEY, CACHE_TTL);
  return items;
}

export async function addCategory(name: string): Promise<Category> {
  const cleanName = name.trim().toLowerCase();
  const rows = await sql`
    INSERT INTO categories (name)
    VALUES (${cleanName})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, created_at
  `;

  await redis.del(CATEGORY_CACHE_KEY);
  return rows[0] as unknown as Category;
}

export async function deleteCategory(idOrName: number | string): Promise<boolean> {
  let rows;
  if (typeof idOrName === 'number' || !isNaN(Number(idOrName))) {
    const id = Number(idOrName);
    rows = await sql`
      DELETE FROM categories
      WHERE id = ${id} AND name != 'general'
      RETURNING id
    `;
  } else {
    const cleanName = String(idOrName).trim().toLowerCase();
    if (cleanName === 'general') {
      return false; // protect default category
    }
    rows = await sql`
      DELETE FROM categories
      WHERE LOWER(name) = ${cleanName}
      RETURNING id
    `;
  }

  await redis.del(CATEGORY_CACHE_KEY);
  return rows.length > 0;
}
