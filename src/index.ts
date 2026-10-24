import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { startBots } from './bot';
import { todoRoutes, categoryRoutes, whitelistRoutes, dashboardRoutes } from './routes';
import { whitelistMiddleware } from './middleware/whitelist';

const app = new Hono();

// Start bots alongside Hono server
startBots().catch((err) => {
  console.error("Error starting bots:", err);
});

// Static assets middleware
app.use('/static/*', serveStatic({ root: './' }));
app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));

// Mount modular routes
app.route('/todos', todoRoutes);
app.route('/categories', categoryRoutes);
app.route('/whitelist', whitelistRoutes);
app.route('/', dashboardRoutes);

export default app;
