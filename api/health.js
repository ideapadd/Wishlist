// Diagnostics: shows which storage settings the site can see (names only, never values).
import { configured, envNames, cmd } from '../lib/redis.js';

export default async function handler(req, res) {
  let storage = 'not_configured';
  if (configured()) { try { await cmd('PING'); storage = 'ok'; } catch (e) { storage = 'error: ' + String(e.message).slice(0, 120); } }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ storage, adminPassword: !!process.env.ADMIN_PASSWORD, envNames: envNames() }, null, 2));
}
