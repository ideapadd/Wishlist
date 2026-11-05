import { ensureSeeded, pipe, hashToObj, send, guard } from '../lib/redis.js';

export default async function handler(req, res) {
  if (!guard(res)) return;
  try {
    await ensureSeeded();
    const [g, p, s] = await pipe([['HGETALL', 'gifts'], ['HGETALL', 'pledges'], ['GET', 'settings']]);
    const gifts = Object.entries(hashToObj(g)).map(([id, v]) => ({ id, ...v }));
    const pledges = Object.entries(hashToObj(p)).map(([id, v]) => ({ id, giftId: v.giftId, mode: v.mode, keyHash: v.keyHash }));
    let settings = null; try { settings = s ? JSON.parse(s) : null; } catch {}
    send(res, 200, { gifts, pledges, settings });
  } catch (e) {
    send(res, 500, { error: 'Server error', code: 'server' });
  }
}
