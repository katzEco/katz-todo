import { Hono } from 'hono';
import htmlContent from '../../public/index.html' with { type: 'text' };
import cssContent from '../../public/css/style.css' with { type: 'text' };
import jsContent from '../../public/js/app.js' with { type: 'text' };
import { getTodoStats } from '../modules/todo';
import { getBotsStatus } from '../bot';

export const dashboardRoutes = new Hono();

// GET / - Root endpoint (Browser: HTML Dashboard, Client API: JSON)
dashboardRoutes.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return c.json({
      status: 'ok',
      service: 'katz-todo',
      version: '1.0.0',
      uptime: process.uptime(),
      bots: getBotsStatus(),
      message: 'Todo service & bots running.',
    });
  }
  return c.html(htmlContent);
});

// GET /dashboard - Direct access to HTML dashboard
dashboardRoutes.get('/dashboard', (c) => {
  return c.html(htmlContent);
});

// Static asset fallbacks (bundled into binary)
dashboardRoutes.get('/css/style.css', (c) => {
  c.header('Content-Type', 'text/css; charset=utf-8');
  return c.body(cssContent);
});

dashboardRoutes.get('/js/app.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8');
  return c.body(jsContent);
});

// GET /api/status - System status, bot connection statuses and metrics
dashboardRoutes.get('/api/status', async (c) => {
  const stats = await getTodoStats();
  const bots = getBotsStatus();
  return c.json({
    status: 'ok',
    service: 'katz-todo',
    uptime: process.uptime(),
    bots,
    stats,
  });
});
