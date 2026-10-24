import { Hono } from 'hono';
import {
  listCategories,
  addCategory,
  deleteCategory,
  type CreateCategoryDto,
} from '../modules/category';

export const categoryRoutes = new Hono();

// GET /categories - List all categories with task counts
categoryRoutes.get('/', async (c) => {
  const items = await listCategories();
  return c.json(items);
});

// POST /categories - Add new category
categoryRoutes.post('/', async (c) => {
  const body = await c.req.json<CreateCategoryDto>().catch(() => ({ name: '' }));
  if (!body.name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }
  const item = await addCategory(body.name.trim());
  return c.json(item, 201);
});

// DELETE /categories/:id - Delete category
categoryRoutes.delete('/:id', async (c) => {
  const idOrName = c.req.param('id');
  if (!idOrName) {
    return c.json({ error: "id or name required" }, 400);
  }
  const deleted = await deleteCategory(idOrName);
  if (!deleted) {
    return c.json({ error: "category not found or protected ('general')" }, 404);
  }
  return c.json({ success: true, identifier: idOrName });
});
