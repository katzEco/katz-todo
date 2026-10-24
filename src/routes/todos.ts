import { Hono } from 'hono';
import {
  listTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  getTodoStats,
  type CreateTodoDto,
  type UpdateTodoDto,
} from '../modules/todo';

export const todoRoutes = new Hono();

// GET /todos - List all todo items (optional query ?category=work)
todoRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  const items = await listTodos(category);
  return c.json(items);
});

// GET /todos/stats - Aggregated metrics
todoRoutes.get('/stats', async (c) => {
  const stats = await getTodoStats();
  return c.json(stats);
});

// POST /todos - Create a new todo item with category
todoRoutes.post('/', async (c) => {
  const body = await c.req.json<CreateTodoDto>().catch(() => ({ title: '', category: 'general' }));
  if (!body.title?.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  const item = await addTodo(body.title.trim(), body.category || 'general');
  return c.json(item, 201);
});

// PATCH /todos/:id - Update completion status, category, or title
todoRoutes.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: "invalid id" }, 400);
  }
  const body = await c.req.json<UpdateTodoDto>().catch(() => ({}));
  if (typeof body.completed !== "boolean" && !body.category && !body.title) {
    return c.json({ error: "completed boolean, category, or title required" }, 400);
  }
  const item = await updateTodo(id, body);
  if (!item) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(item);
});

// DELETE /todos/:id - Remove todo
todoRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: "invalid id" }, 400);
  }
  const deleted = await deleteTodo(id);
  if (!deleted) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ success: true, id });
});
