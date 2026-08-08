const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-jh-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

process.on('uncaughtException', (e) => console.error('[GUARD] uncaughtException:', e.message));
process.on('unhandledRejection', (e) => console.error('[GUARD] unhandledRejection:', (e && e.message) || e));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function storeGet(key) {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, key + '.json'), 'utf8');
    const item = JSON.parse(raw);
    if (item.exp && Date.now() > item.exp) { fs.unlinkSync(path.join(DATA_DIR, key + '.json')); return null; }
    return item.data;
  } catch { return null; }
}
function storeSet(key, data, ttlSec = 7200) {
  fs.writeFileSync(path.join(DATA_DIR, key + '.json'), JSON.stringify({ data, exp: Date.now() + ttlSec * 1000 }));
}
function makeCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.get('/', (req, res) => res.json({ service: 'JH-Tools API', status: 'operational', uptime: process.uptime(), port: 4100 }));

app.post('/resstore', (req, res) => {
  if (req.headers['x-jh-key'] !== 'JH-SECRET-2026') return res.status(401).json({ error: 'unauthorized' });
  const { key, url, b64, ct, kind, p } = req.body;
  if (!key) return res.status(400).json({ error: 'missing key' });
  storeSet(key, { u: url || null, b64: b64 || null, ct: ct || null, k: kind || 'img', p: p || null });
  res.json({ ok: true });
});

app.post('/upload', (req, res) => {
  try {
    const { b64, ct } = req.body;
    if (!b64) return res.status(400).json({ status: false, error: 'File kosong!' });
    const code = makeCode();
    storeSet('resimg:' + code, { b64, ct: ct || 'image/jpeg', k: 'img' });
    res.json({ status: true, url: 'https://api.jhx.my.id/resimg/' + code + '.jpg' });
  } catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

/* ================= IG DOWNLOADER ================= */
app.post('/ig-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !url.includes('instagram.com')) return res.status(400).json({ Status: false, error: 'URL Instagram tidak valid!' });

    const jantung = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'HX-Request': 'true', 'HX-Trigger': 'main-form', 'HX-Target': 'target',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const initRes = await axios.get('https://reelsvideo.io/id-4', { headers: { 'User-Agent': jantung['User-Agent'] } });
    const $init = cheerio.load(initRes.data);
    const tt = $init('#tt').val(), ts = $init('#ts').val();
    if (!tt || !ts) throw new Error('Gagal ambil parameter tt/ts');

    const { data: { jobId } } = await axios.post('https://cap.jhx.my.id/api/createTask', {
      url: 'https://reelsvideo.io/id-4', type: 'turnstile-min', sitekey: '0x4AAAAAACVCPoioqL3q_FXF'
    });

    let token, tries = 0;
    while (!token && tries < 25) {
      tries++; await sleep(2000);
      const { data } = await axios.post('https://cap.jhx.my.id/api/getResult', { jobId });
      if (data.status === 'ready') token = data.solution.token;
      if (data.status === 'failed') throw new Error('Solver gagal');
    }
    if (!token) throw new Error('Solver timeout');

    const payload = new URLSearchParams({ id: url, locale: 'id', tt, ts, 'cf-turnstile-response': token });
    const resp = await axios.post('https://reelsvideo.io/id-4', payload, { headers: jantung });
    const $ = cheerio.load(resp.data);

    const rawProfilePic = $('#profile_grid img.rounded-full').first().attr('src');
    const items = [];
    $('#profile_grid .bg-white.relative.rounded-3xl').each((_, el) => {
      let type = 'unknown';
      if ($(el).find('.type_videos').length) type = 'video';
      else if ($(el).find('.type_images').length) type = 'image';
      else if ($(el).find('.type_audio').length) type = 'audio';
      const thumbnail = $(el).find('[data-bg]').attr('data-bg');
      const downloadUrl = $(el).find('a.download_link, a.mp3').attr('href');
      if (downloadUrl) items.push({ type, thumbnail, downloadUrl });
    });

    const sizes = await Promise.all(items.map(async (i) => {
      try { const r = await axios.head(i.downloadUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }); return parseInt(r.headers['content-length'] || '0') || 0; }
      catch { return 0; }
    }));

    function register(route, target, kind) {
      if (!target) return target;
      const code = makeCode();
      storeSet(route + ':' + code, { u: target, k: kind });
      return 'https://api.jhx.my.id/' + route + '/' + code + (route === 'resvid' ? '.mp4' : '.jpg');
    }

    const mediaList = items.map((m, i) => {
      const code = makeCode();
      const route = m.type === 'image' ? 'resimg' : 'resvid';
      const kind = m.type === 'video' ? 'vid' : m.type === 'audio' ? 'aud' : 'img';
      const ext = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'mp3' : 'jpg';
      storeSet(route + ':' + code, { u: m.downloadUrl, k: kind });
      return {
        type: m.type,
        thumbnail: register('resimg', m.thumbnail, 'img'),
        url: 'https://api.jhx.my.id/' + route + '/' + code + '.' + ext,
        filename: 'JHIG_' + kind + '_' + code + '.' + ext,
        size: sizes[i],
        sizeHuman: sizes[i] > 0 ? (sizes[i] > 1048576 ? (sizes[i]/1048576).toFixed(2)+' MB' : (sizes[i]/1024).toFixed(1)+' KB') : null
      };
    });

    res.json({
      Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true,
      data: { username: $('#profile_grid .text-400-16-18').first().text().trim(), profilePic: register('resimg', rawProfilePic, 'img'), media: mediaList }
    });
  } catch (e) { res.status(500).json({ Status: false, error: e.response?.data || e.message }); }
});

/* ============ FACESWAP ENGINE V2 (ANTI-BLOCK) ============ */
const UA = 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const VH = {
  'accept': '*/*',
  'accept-language': 'id-ID',
  'content-type': 'application/json',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'origin': 'https://vidmage.ai',
  'referer': 'https://vidmage.ai/id/face-swap',
  'User-Agent': UA
};

async function vpost(base, p, body) {
  const r = await axios.post(base + p, body, { headers: VH, validateStatus: () => true, timeout: 30000 });
  return r.data;
}

async function getFaceId(base, imageUrl) {
  const det = await vpost(base, '/api/internal/cloud-make/face-detection', { targetFileURL: imageUrl, mediaType: 'image', priority: 0, language: 'id_ID', regionCode: 'ID' });
  if (!det || !det.businessId) throw new Error('DETECT_RAW: ' + JSON.stringify(det).slice(0, 250));
  let task = null, last = null;
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const poll = await vpost(base, '/api/face-swap/task-result', { businessId: det.businessId, lastQuery: false, language: 'id_ID', regionCode: 'ID' });
    last = poll;
    if (poll && poll.code === 200 && poll.data && poll.data.extraEventResult) { task = poll.data; break; }
  }
  if (!task) throw new Error('POLL_RAW: ' + JSON.stringify(last).slice(0, 250));
  const parse = await vpost(base, '/api/internal/cloud-make/parse-result', { type: 'imageFaceDetection', result: { code: 200, data: task, message: 'successful', success: true }, language: 'id_ID', regionCode: 'ID' });
  if (!parse || !parse.data || !parse.data[0]) throw new Error('PARSE_RAW: ' + JSON.stringify(parse).slice(0, 250));
  return parse.data[0];
}

async function runFaceSwap(base, targetUrl, swapUrl) {
  await vpost(base, '/api/internal/free-swap/get', { localStorageUsage: { imageUsed: 0, videoUsed: 0, gifUsed: 0 } });
  const tf = await getFaceId(base, targetUrl);
  const sf = await getFaceId(base, swapUrl);
  const sw = await vpost(base, '/api/internal/cloud-make/swap-face', {
    mediaType: 'image', targetFileURL: targetUrl,
    faceParams: [{ faceID: tf.faceID, remoteTargetFaceCroppedURL: tf.remoteTargetFaceCroppedURL, remoteReferenceFacePublicURL: sf.remoteTargetFaceCroppedURL }],
    priority: 0, language: 'id_ID', regionCode: 'ID', localStorageUsage: { imageUsed: 0, videoUsed: 0, gifUsed: 0 }
  });
  if (!sw || !sw.businessId) throw new Error('SWAP_RAW: ' + JSON.stringify(sw).slice(0, 250));
  let fin = null, last = null;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const r = await vpost(base, '/api/face-swap/task-result', { businessId: sw.businessId, lastQuery: false, language: 'id_ID', regionCode: 'ID' });
    last = r;
    if (r && r.code === 200 && r.data && r.data.fileUrl) { fin = r.data; break; }
  }
  if (!fin) throw new Error('SWAPPOLL_RAW: ' + JSON.stringify(last).slice(0, 250));
  const pf = await vpost(base, '/api/internal/cloud-make/parse-result', { type: 'swapFace', result: { code: 200, data: fin, message: 'successful', success: true }, language: 'id_ID', regionCode: 'ID' });
  if (!pf || !pf.data) throw new Error('FINALPARSE_RAW: ' + JSON.stringify(pf).slice(0, 250));
  return pf.data;
}

app.post('/faceswap', async (req, res) => {
  try {
    const { target, swap } = req.body;
    if (!target || !swap) return res.status(400).json({ status: false, error: 'URL target dan swap wajib diisi!' });
    const bases = ['https://jhx.my.id/FionySwap', 'https://vidmage.ai'];
    let result = null, lastErr = '';
    for (const base of bases) {
      try { result = await runFaceSwap(base, target, swap); break; }
      catch (e) { lastErr = e.message; console.error('[FACESWAP] gagal via', base, '→', e.message); }
    }
    if (!result) return res.status(500).json({ status: false, error: 'Deteksi wajah gagal! ' + lastErr });
    const code = makeCode();
    storeSet('resimg:' + code, { u: result, k: 'img', p: 'JHSwap' });
    res.json({ Developer: 'JH a.k.a Dhika', kesayangan: 'Fiony Alveria♡', status: true, data: { url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', filename: 'JHSwap_' + code + '.jpg' } });
  } catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

/* ================= PROXY FILE ================= */
async function serveProxy(req, res) {
  const route = req.path.startsWith('/resvid') ? 'resvid' : 'resimg';
  const code = String(req.params.code).split('.')[0];
  const item = storeGet(route + ':' + code);
  if (!item) return res.status(410).json({ error: 'link expired' });
  const kind = item.k || 'img';
  const ext = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'mp3' : 'jpg';
  const prefix = item.p || ('JHIG_' + kind);

  if (item.b64) {
    const bin = Buffer.from(item.b64, 'base64');
    res.setHeader('Content-Type', item.ct || 'image/jpeg');
    res.setHeader('Content-Length', bin.length);
    res.setHeader('Content-Disposition', 'attachment; filename="' + prefix + '_' + code + '.' + ext + '"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(bin);
  }

  try {
    const hdrs = { 'User-Agent': UA, 'Referer': 'https://www.instagram.com/', 'Accept': '*/*' };
    if (req.headers.range) hdrs.Range = req.headers.range;
    const up = await axios.get(item.u, { responseType: 'stream', timeout: 60000, headers: hdrs });
    if (req.headers.range) { res.status(206); if (up.headers['content-range']) res.setHeader('Content-Range', up.headers['content-range']); }
    res.setHeader('Accept-Ranges', 'bytes');
    up.data.on('error', (e) => console.error('[STREAM]', e.message));
    res.setHeader('Content-Type', up.headers['content-type'] || (kind === 'vid' ? 'video/mp4' : 'image/jpeg'));
    if (up.headers['content-length']) res.setHeader('Content-Length', up.headers['content-length']);
    res.setHeader('Content-Disposition', 'attachment; filename="' + prefix + '_' + code + '.' + ext + '"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    up.data.pipe(res);
  } catch (e) { res.status(502).json({ error: 'upstream error' }); }
}
app.get('/resimg/:code', serveProxy);
app.get('/resvid/:code', serveProxy);

const PORT = 4100;
const server = app.listen(PORT, () => console.log('✓ JH-Tools API running on port ' + PORT));
server.on('error', (e) => { console.error('LISTEN ERROR:', e.message); process.exit(1); });
