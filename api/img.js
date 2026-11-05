import { cmd, configured } from '../lib/redis.js';

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  if (!configured() || !/^[\w-]{1,40}$/.test(id)) { res.statusCode = 404; return res.end(); }
  const d = await cmd('GET', `img:${id}`).catch(() => null);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d || '');
  if (!m) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(Buffer.from(m[2], 'base64'));
}
