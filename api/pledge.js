// Anonymous reservations: nothing about the person is stored, only a hash of a random key
// kept in their browser so they (and only they) can cancel.
import { cmd, hashToObj, send, guard, readBody, randId, sha256 } from '../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!guard(res)) return;
  const b = await readBody(req);
  try {
    if (b.action === 'claim') {
      const { giftId, mode, keyHash } = b;
      if (typeof giftId !== 'string' || !/^[a-f0-9]{64}$/.test(keyHash || '') || !['solo', 'group'].includes(mode))
        return send(res, 400, { error: 'Bad request', code: 'bad_request' });
      if (!(await cmd('HEXISTS', 'gifts', giftId))) return send(res, 404, { error: 'No such gift', code: 'not_found' });
      const record = JSON.stringify({ giftId, mode, keyHash, at: Date.now() });
      if (mode === 'solo') {
        const all = hashToObj(await cmd('HGETALL', 'pledges'));
        if (Object.values(all).some(p => p.giftId === giftId && p.mode === 'group'))
          return send(res, 409, { error: 'Group in progress', code: 'group' });
        const id = `${giftId}__solo`;
        const ok = await cmd('HSETNX', 'pledges', id, record);
        if (ok !== 1) return send(res, 409, { error: 'Already taken', code: 'taken' });
        return send(res, 200, { id });
      }
      if (await cmd('HEXISTS', 'pledges', `${giftId}__solo`)) return send(res, 409, { error: 'Already taken', code: 'taken' });
      const id = `${giftId}__g_${randId()}`;
      await cmd('HSET', 'pledges', id, record);
      return send(res, 200, { id });
    }
    if (b.action === 'cancel') {
      const raw = await cmd('HGET', 'pledges', String(b.id || ''));
      if (!raw) return send(res, 200, { ok: true });
      const p = JSON.parse(raw);
      if (!b.key || sha256(b.key) !== p.keyHash) return send(res, 403, { error: 'Not your pledge', code: 'forbidden' });
      await cmd('HDEL', 'pledges', b.id);
      return send(res, 200, { ok: true });
    }
    send(res, 400, { error: 'Unknown action', code: 'bad_request' });
  } catch (e) {
    send(res, 500, { error: 'Server error', code: 'server' });
  }
}
