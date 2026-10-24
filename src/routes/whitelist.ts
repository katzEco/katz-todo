import { Hono } from 'hono';
import {
  listWhitelist,
  addWhitelist,
  updateWhitelist,
  deleteWhitelist,
  type CreateWhitelistDto,
  type UpdateWhitelistDto,
} from '../modules/whitelist';

export const whitelistRoutes = new Hono();

// GET /whitelist - List all whitelist entries
whitelistRoutes.get('/', async (c) => {
  const items = await listWhitelist();
  return c.json(items);
});

// POST /whitelist - Add Discord or Telegram User ID to whitelist
whitelistRoutes.post('/', async (c) => {
  const body = await c.req.json<CreateWhitelistDto>().catch(() => ({ value: '', type: 'telegram' as const }));
  if (!body.value?.trim()) {
    return c.json({ error: "value (Discord or Telegram User ID) is required" }, 400);
  }
  if (!body.type || (body.type !== 'telegram' && body.type !== 'discord')) {
    body.type = 'telegram';
  }
  const item = await addWhitelist(body);
  return c.json(item, 201);
});

// PATCH /whitelist/:id - Update status or label
whitelistRoutes.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: "invalid id" }, 400);
  }
  const body = await c.req.json<UpdateWhitelistDto>().catch(() => ({}));
  const item = await updateWhitelist(id, body);
  if (!item) {
    return c.json({ error: "not found or no fields to update" }, 404);
  }
  return c.json(item);
});

// DELETE /whitelist/:id - Delete whitelist entry
whitelistRoutes.delete('/:id', async (c) => {
  const idOrValue = c.req.param('id');
  if (!idOrValue) {
    return c.json({ error: "id or value required" }, 400);
  }
  const deleted = await deleteWhitelist(idOrValue);
  if (!deleted) {
    return c.json({ error: "whitelist entry not found" }, 404);
  }
  return c.json({ success: true, identifier: idOrValue });
});
