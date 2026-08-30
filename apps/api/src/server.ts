import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { projects } from './routes/projects';

const app = new Hono();

app.use('*', cors()); // web (:3000) → api (:4000)

app.get('/', (c) => c.json({ ok: true, service: 'manimate-api' }));
app.route('/api/projects', projects);

export default {
  port: Number(process.env.PORT ?? 4000),
  fetch: app.fetch,
};
