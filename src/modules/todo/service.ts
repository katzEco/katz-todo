import { sql, redis } from '../../db';
import { initCategoryDb } from '../category';
import { initWhitelistDb } from '../whitelist';
import type { TodoItem, TodoStats, UpdateTodoDto } from './types';

const CACHE_KEY = "todo:list";
const CACHE_TTL = 60; // seconds

export async function initDb(): Promise<void> {
  await initCategoryDb();
  await initWhitelistDb();

  await sql`
    CREATE TABLE IF NOT EXISTS todo_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Ensure column exists if migrating an existing table
  await sql`
    ALTER TABLE todo_items 
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'
  `;
}

export async function listTodos(categoryFilter?: string): Promise<TodoItem[]> {
  const cached = await redis.get(CACHE_KEY);
  let items: TodoItem[] = [];

  if (cached) {
    try {
      items = JSON.parse(cached);
    } catch {
      // cache corrupted, query db
    }
  }

  if (items.length === 0 && !cached) {
    const rows = await sql`
      SELECT id, title, category, completed, created_at, updated_at
      FROM todo_items
      ORDER BY id ASC
    `;
    items = rows as unknown as TodoItem[];
    await redis.set(CACHE_KEY, JSON.stringify(items));
    await redis.expire(CACHE_KEY, CACHE_TTL);
  }

  if (categoryFilter) {
    const filter = categoryFilter.trim().toLowerCase();
    return items.filter((t) => t.category.toLowerCase() === filter);
  }

  return items;
}

export async function addTodo(title: string, category: string = 'general'): Promise<TodoItem> {
  const cleanCat = (category || 'general').trim().toLowerCase();

  // Ensure category exists in categories table
  await sql`
    INSERT INTO categories (name)
    VALUES (${cleanCat})
    ON CONFLICT (name) DO NOTHING
  `;

  const rows = await sql`
    INSERT INTO todo_items (title, category)
    VALUES (${title}, ${cleanCat})
    RETURNING id, title, category, completed, created_at, updated_at
  `;

  await redis.del(CACHE_KEY);
  await redis.del("category:list");
  return rows[0] as unknown as TodoItem;
}

export async function updateTodo(id: number, updates: UpdateTodoDto): Promise<TodoItem | null> {
  const fields = [];
  
  if (typeof updates.completed === 'boolean') {
    fields.push(sql`completed = ${updates.completed}`);
  }
  if (updates.category) {
    const cleanCat = updates.category.trim().toLowerCase();
    await sql`
      INSERT INTO categories (name)
      VALUES (${cleanCat})
      ON CONFLICT (name) DO NOTHING
    `;
    fields.push(sql`category = ${cleanCat}`);
    await redis.del("category:list");
  }
  if (updates.title) {
    fields.push(sql`title = ${updates.title.trim()}`);
  }

  if (fields.length === 0) {
    const rows = await sql`SELECT * FROM todo_items WHERE id = ${id}`;
    return (rows[0] as unknown as TodoItem) || null;
  }

  // Execute update
  const rows = await sql`
    UPDATE todo_items
    SET ${fields.reduce((prev, curr) => sql`${prev}, ${curr}`)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, category, completed, created_at, updated_at
  `;

  await redis.del(CACHE_KEY);
  await redis.del("category:list");
  return (rows[0] as unknown as TodoItem) || null;
}

export async function updateTodoStatus(id: number, completed: boolean): Promise<TodoItem | null> {
  return updateTodo(id, { completed });
}

export async function deleteTodo(id: number): Promise<boolean> {
  const rows = await sql`
    DELETE FROM todo_items
    WHERE id = ${id}
    RETURNING id
  `;

  await redis.del(CACHE_KEY);
  await redis.del("category:list");
  return rows.length > 0;
}

export async function getTodoStats(): Promise<TodoStats> {
  const items = await listTodos();
  const total = items.length;
  const completed = items.filter((t) => t.completed).length;
  const pending = total - completed;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const categoryCounts: Record<string, number> = {};
  for (const item of items) {
    const cat = item.category || 'general';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  return {
    total,
    completed,
    pending,
    completionRate,
    categoryCounts,
  };
}
