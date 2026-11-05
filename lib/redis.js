// Tiny Upstash Redis REST client (works with Vercel's "Upstash for Redis" integration).
import crypto from 'node:crypto';
import seed from './seed.js';

const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
export const configured = () => { const e = env(); return !!(e.url && e.token); };

async function call(path, body) {
  const { url, token } = env();
  const r = await fetch(url.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j;
}
export async function cmd(...args) { return (await call('', args)).result; }
export async function pipe(cmds) {
  const out = await call('/pipeline', cmds);
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
export const hashToObj = arr => {
  const o = {};
  for (let i = 0; i < (arr || []).length; i += 2) { try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch {} }
  return o;
};
export async function ensureSeeded() {
  const first = await cmd('SETNX', 'seeded', '1');
  if (first === 1) {
    const args = ['HSET', 'gifts'];
    for (const [id, g] of Object.entries(seed)) args.push(id, JSON.stringify(g));
    await cmd(...args);
  }
}
export const randId = () => crypto.randomBytes(9).toString('base64url');
export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export function guard(res) {
  if (!configured()) { send(res, 503, { error: 'Storage is not connected', code: 'not_configured' }); return false; }
  return true;
}
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
