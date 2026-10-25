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

  // Import any existing categories from todo_items that are not in categories table
  try {
    await sql`
      INSERT INTO categories (name)
      SELECT DISTINCT LOWER(category)
      FROM todo_items
      WHERE category IS NOT NULL AND category != ''
      ON CONFLICT (name) DO NOTHING
    `;
  } catch {
    // If todo_items table doesn't exist yet on clean start
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

export async function updateCategory(id: number, newName: string): Promise<Category | null> {
  const clean = newName.trim().toLowerCase();
  if (!clean) return null;

  // Retrieve current category
  const existing = await sql`SELECT name FROM categories WHERE id = ${id}`;
  if (existing.length === 0 || existing[0].name === 'general') {
    return null; // not found or protected
  }
  const oldName = existing[0].name;

  const rows = await sql`
    UPDATE categories
    SET name = ${clean}
    WHERE id = ${id}
    RETURNING id, name, created_at
  `;
  if (rows.length === 0) return null;

  // Update existing tasks with old category name
  await sql`
    UPDATE todo_items
    SET category = ${clean}
    WHERE LOWER(category) = LOWER(${oldName})
  `;

  await redis.del(CATEGORY_CACHE_KEY);
  await redis.del("todo:list");
  return rows[0] as unknown as Category;
}

export async function deleteCategory(idOrName: number | string): Promise<boolean> {
  let rows;
  let targetName: string | null = null;

  if (typeof idOrName === 'number' || !isNaN(Number(idOrName))) {
    const id = Number(idOrName);
    const existing = await sql`SELECT name FROM categories WHERE id = ${id}`;
    if (existing.length === 0 || existing[0].name === 'general') {
      return false;
    }
    targetName = existing[0].name;
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
    targetName = cleanName;
    rows = await sql`
      DELETE FROM categories
      WHERE LOWER(name) = ${cleanName}
      RETURNING id
    `;
  }

  if (rows.length > 0 && targetName) {
    // Reassign orphan tasks to 'general'
    await sql`
      UPDATE todo_items
      SET category = 'general'
      WHERE LOWER(category) = LOWER(${targetName})
    `;
    await redis.del("todo:list");
  }

  await redis.del(CATEGORY_CACHE_KEY);
  return rows.length > 0;
}
