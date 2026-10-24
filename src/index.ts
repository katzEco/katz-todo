import { Hono } from 'hono'
import { startBots } from './bot'
import { listTodos, addTodo, updateTodoStatus, deleteTodo } from './db'

const app = new Hono()

// Start bots alongside Hono server
startBots().catch((err) => {
  console.error("Error starting bots:", err);
});

app.get('/', (c) => {
  return c.text('Hello Hono! Todo service & bots running.')
})

app.get('/todos', async (c) => {
  const items = await listTodos();
  return c.json(items);
})

app.post('/todos', async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
  if (!body.title?.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  const item = await addTodo(body.title.trim());
  return c.json(item, 201);
})

app.patch('/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: "invalid id" }, 400);
  }
  const body = await c.req.json<{ completed?: boolean }>().catch(() => ({ completed: undefined }));
  if (typeof body.completed !== "boolean") {
    return c.json({ error: "completed boolean required" }, 400);
  }
  const item = await updateTodoStatus(id, body.completed);
  if (!item) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(item);
})

app.delete('/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: "invalid id" }, 400);
  }
  const deleted = await deleteTodo(id);
  if (!deleted) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ success: true, id });
})

export default app
