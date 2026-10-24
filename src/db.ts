// ponytail: native Bun.SQL and Bun.RedisClient - zero db-driver overhead
const PG_URL = process.env.DATABASE_URL || "postgres://dethz:dethz198@localhost:5431/app";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";

export const sql = new Bun.SQL(PG_URL);
export const redis = new Bun.RedisClient(REDIS_URL);

export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

const CACHE_KEY = "todo:list";
const CACHE_TTL = 60; // seconds

export async function initDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS todo_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function listTodos(): Promise<TodoItem[]> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // cache invalid, query db
    }
  }

  const rows = await sql`
    SELECT id, title, completed, created_at, updated_at
    FROM todo_items
    ORDER BY id ASC
  `;

  const items = rows as unknown as TodoItem[];
  await redis.set(CACHE_KEY, JSON.stringify(items));
  await redis.expire(CACHE_KEY, CACHE_TTL);
  return items;
}

export async function addTodo(title: string): Promise<TodoItem> {
  const rows = await sql`
    INSERT INTO todo_items (title)
    VALUES (${title})
    RETURNING id, title, completed, created_at, updated_at
  `;

  await redis.del(CACHE_KEY);
  return rows[0] as unknown as TodoItem;
}

export async function updateTodoStatus(id: number, completed: boolean): Promise<TodoItem | null> {
  const rows = await sql`
    UPDATE todo_items
    SET completed = ${completed}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, completed, created_at, updated_at
  `;

  await redis.del(CACHE_KEY);
  return (rows[0] as unknown as TodoItem) || null;
}

export async function deleteTodo(id: number): Promise<boolean> {
  const rows = await sql`
    DELETE FROM todo_items
    WHERE id = ${id}
    RETURNING id
  `;

  await redis.del(CACHE_KEY);
  return rows.length > 0;
}
