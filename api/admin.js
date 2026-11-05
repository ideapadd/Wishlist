import crypto from 'node:crypto';
import { cmd, hashToObj, send, guard, readBody, randId, ensureSeeded } from '../lib/redis.js';

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const okUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const okImg = u => (typeof u === 'string' && (/^\/img\/[\w.-]+$/.test(u) || /^\/api\/img\?id=[\w-]+$/.test(u))) ? u : null;

function clean(d = {}) {
  return {
    title: str(d.title, 200), price: Math.max(0, Math.round(Number(d.price) || 0)),
    url: okUrl(d.url), url2: okUrl(d.url2), note: str(d.note, 1000),
    love: !!d.love, top: !!d.top, last: !!d.last, tier: ['s', 'm', 'l', 'x', 'xx'].includes(d.tier) ? d.tier : '',
    imageUrl: okImg(d.imageUrl), createdAt: Number(d.createdAt) || Date.now(),
  };
}
function authorized(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-password'] || '');
  if (!want) return 'no_password';
  const a = crypto.createHash('sha256').update(want).digest(), b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b) ? 'ok' : 'unauthorized';
}
const imgId = u => (/^\/api\/img\?id=([\w-]+)$/.exec(u || '') || [])[1];

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const auth = authorized(req);
  if (auth !== 'ok') return send(res, auth === 'no_password' ? 503 : 401, { error: 'Unauthorized', code: auth });
  if (!guard(res)) return;
  const b = await readBody(req);
  try {
    switch (b.action) {
      case 'check': return send(res, 200, { ok: true });
      case 'saveGift': {
        await ensureSeeded();
        const id = typeof b.id === 'string' && /^[\w-]{1,80}$/.test(b.id) ? b.id : randId();
        const data = clean(b.data);
        if (!data.title) return send(res, 400, { error: 'Title required', code: 'bad_request' });
        await cmd('HSET', 'gifts', id, JSON.stringify(data));
        return send(res, 200, { id });
      }
      case 'deleteGift': {
        const raw = await cmd('HGET', 'gifts', String(b.id || ''));
        const pledges = hashToObj(await cmd('HGETALL', 'pledges'));
        const ids = Object.entries(pledges).filter(([, p]) => p.giftId === b.id).map(([k]) => k);
        if (ids.length) await cmd('HDEL', 'pledges', ...ids);
        await cmd('HDEL', 'gifts', String(b.id || ''));
        const iid = raw ? imgId(JSON.parse(raw).imageUrl) : null;
        if (iid) await cmd('DEL', `img:${iid}`);
        return send(res, 200, { ok: true });
      }
      case 'clearPledges': {
        const pledges = hashToObj(await cmd('HGETALL', 'pledges'));
        const ids = Object.entries(pledges).filter(([, p]) => p.giftId === b.giftId).map(([k]) => k);
        if (ids.length) await cmd('HDEL', 'pledges', ...ids);
        return send(res, 200, { ok: true });
      }
      case 'saveSettings': {
        const s = b.settings || {};
        const settings = { name: str(s.name, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') ? s.date : '', message: str(s.message, 500) };
        await cmd('SET', 'settings', JSON.stringify(settings));
        return send(res, 200, { ok: true });
      }
      case 'uploadImage': {
        const d = b.dataUrl;
        if (typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d)) return send(res, 400, { error: 'Bad image', code: 'bad_request' });
        if (d.length > 1_500_000) return send(res, 413, { error: 'Too large', code: 'too_large' });
        const id = randId();
        await cmd('SET', `img:${id}`, d);
        return send(res, 200, { url: `/api/img?id=${id}` });
      }
      case 'deleteImage': {
        const iid = imgId(b.url);
        if (iid) await cmd('DEL', `img:${iid}`);
        return send(res, 200, { ok: true });
      }
    }
    send(res, 400, { error: 'Unknown action', code: 'bad_request' });
  } catch (e) {
    send(res, 500, { error: 'Server error', code: 'server' });
  }
}
