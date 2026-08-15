const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');

const app = express();
app.use(express.json({ limit: '20mb' }));

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
const UA = 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

function cleanTitle(s) {
  return String(s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'track';
}
function human(sz) { return sz > 0 ? (sz > 1048576 ? (sz / 1048576).toFixed(2) + ' MB' : (sz / 1024).toFixed(1) + ' KB') : null; }
async function getSize(u) {
  try { const r = await axios.head(u, { timeout: 8000, headers: { 'User-Agent': UA } }); return parseInt(r.headers['content-length'] || '0') || 0; }
  catch { return 0; }
}

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

app.post('/ig-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !url.includes('instagram.com')) return res.status(400).json({ Status: false, error: 'URL Instagram tidak valid!' });

    const jantung = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'HX-Request': 'true', 'HX-Trigger': 'main-form', 'HX-Target': 'target',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

    const sizes = await Promise.all(items.map(i => getSize(i.downloadUrl)));

    function register(route, target, kind) {
      if (!target) return target;
      const code = makeCode();
      storeSet(route + ':' + code, { u: target, k: kind });
      return 'https://api.jhx.my.id/' + route + '/' + code + '.jpg';
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
        sizeHuman: human(sizes[i])
      };
    });

    res.json({
      Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true,
      data: { username: $('#profile_grid .text-400-16-18').first().text().trim(), profilePic: register('resimg', rawProfilePic, 'img'), media: mediaList }
    });
  } catch (e) { res.status(500).json({ Status: false, error: e.response?.data || e.message }); }
});

app.post('/tw-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/(twitter\.com|x\.com)/.test(url)) return res.status(400).json({ Status: false, error: 'URL Twitter/X tidak valid!' });

    const jantung = {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'accept': '*/*',
      'Referer': 'https://x2twitter.com/en',
      'User-Agent': UA
    };

    const { data: verifyData } = await axios.post('https://x2twitter.com/api/userverify', new URLSearchParams({ url }).toString(), { headers: jantung, validateStatus: () => true });
    const token = verifyData && verifyData.token;
    if (!token) throw new Error('Gagal mengambil token x2twitter');

    const { data: searchData } = await axios.post('https://x2twitter.com/api/ajaxSearch', new URLSearchParams({ q: url, lang: 'en', cftoken: token }).toString(), { headers: jantung, validateStatus: () => true });
    const html = (searchData && (searchData.data || searchData.html)) || (typeof searchData === 'string' ? searchData : '');
    const $ = cheerio.load(html || '');

    const caption = $('.tw-middle .content h3').first().text().trim() || $('.tw-middle h3').first().text().trim() || '';

    function qualOf(txt) { const m = txt.match(/\(([^)]+)\)/); return m ? m[1] : (txt.match(/(\d+p)/i) || [])[1] || 'HD'; }
    function regVid(target) {
      const code = makeCode();
      storeSet('resvid:' + code, { u: target, k: 'vid', ref: 'https://x2twitter.com/en' }, 3600);
      return { url: 'https://api.jhx.my.id/resvid/' + code + '.mp4', filename: 'JHTW_vid_' + code + '.mp4' };
    }
    function regImg(target) {
      const code = makeCode();
      storeSet('resimg:' + code, { u: target, k: 'img', ref: 'https://x2twitter.com/en' }, 3600);
      return { url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', filename: 'JHTW_img_' + code + '.jpg' };
    }
    const isVidTxt = t => /download\s+(mp4|video)/i.test(t);
    const isImgTxt = t => /download\s+(photo|image|jpg|png)/i.test(t);

    const rawItems = [];

    $('.tw-video, .tw-image, .tw-photo, .tw-item, .media-item').each((_, el) => {
      const block = $(el);
      const thumb = block.find('.thumbnail img, .image-tw img, img').first().attr('src') || '';
      const vids = [];
      block.find('a').each((__, a) => {
        const txt = $(a).text().trim();
        const href = $(a).attr('href') || '';
        if (href && isVidTxt(txt)) vids.push({ quality: qualOf(txt), url: href });
      });
      if (vids.length) {
        vids.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        rawItems.push({ type: 'video', thumbnail: thumb, vids });
        return;
      }
      block.find('a').each((__, a) => {
        const txt = $(a).text().trim();
        const href = $(a).attr('href') || '';
        if (href && isImgTxt(txt)) rawItems.push({ type: 'image', thumbnail: thumb, dl: href });
      });
    });

    if (!rawItems.length) {
      const vids = [];
      const imgLinks = [];
      $('a').each((_, a) => {
        const txt = $(a).text().trim();
        const href = $(a).attr('href') || '';
        if (!href || href.startsWith('#')) return;
        if (isVidTxt(txt)) vids.push({ quality: qualOf(txt), url: href });
        else if (isImgTxt(txt) || href.includes('dl.snapcdn.app')) imgLinks.push(href);
      });
      if (vids.length) {
        vids.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        rawItems.push({ type: 'video', thumbnail: $('img').first().attr('src') || '', vids });
      }
      const thumbs = [];
      $('.thumbnail img, .image-tw img').each((_, im) => { const s2 = $(im).attr('src'); if (s2) thumbs.push(s2); });
      imgLinks.forEach((href, i) => rawItems.push({ type: 'image', thumbnail: thumbs[i] || href, dl: href }));
    }

    if (!rawItems.length) return res.status(404).json({ Status: false, error: 'Media tidak ditemukan di tweet ini!' });

    const sizeResults = await Promise.all(rawItems.map(it => it.type === 'video' ? Promise.all(it.vids.map(v => getSize(v.url))) : getSize(it.dl)));

    const media = rawItems.map((it, idx) => {
      if (it.type === 'video') {
        return {
          type: 'video',
          thumbnail: it.thumbnail ? regImg(it.thumbnail).url : '',
          variants: it.vids.map((v, i) => {
            const reg = regVid(v.url);
            const sz = sizeResults[idx][i];
            return { quality: v.quality, url: reg.url, filename: reg.filename, size: sz, sizeHuman: human(sz) };
          })
        };
      }
      const reg = regImg(it.dl);
      const sz = sizeResults[idx];
      return {
        type: 'image',
        thumbnail: it.thumbnail ? regImg(it.thumbnail).url : reg.url,
        url: reg.url,
        filename: reg.filename,
        size: sz,
        sizeHuman: human(sz)
      };
    });

    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, data: { caption, media } });
  } catch (e) { res.status(500).json({ Status: false, error: e.response?.data || e.message }); }
});

async function spotSession() {
  const { data: taskData } = await axios.post('https://cap.jhx.my.id/api/createTask', { url: 'https://spotdown.org/', type: 'turnstile-min', sitekey: '0x4AAAAAACrWMhU5hqsstO80' });
  const jobId = taskData && taskData.jobId;
  if (!jobId) throw new Error('Gagal create task captcha spotdown');
  let cfToken = null;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const { data: pollData } = await axios.post('https://cap.jhx.my.id/api/getResult', { jobId });
    if (pollData && pollData.status === 'ready' && pollData.solution && pollData.solution.token) { cfToken = pollData.solution.token; break; }
  }
  if (!cfToken) throw new Error('Timeout bypass Turnstile spotdown');
  const { data: nonceData } = await axios.post('https://spotdown.org/apinew/issue-nonce', { cfToken });
  const sessionToken = nonceData && nonceData.token;
  if (!sessionToken) throw new Error('Gagal session token spotdown');
  return sessionToken;
}

app.post('/sp-search', async (req, res) => {
  try {
    const q = (req.body && req.body.q) || '';
    if (!q) return res.status(400).json({ Status: false, error: 'Kata kunci pencarian kosong!' });
    const sessionToken = await spotSession();
    const { data: searchData } = await axios.get('https://spotdown.org/apinew/song-details?url=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json, text/plain, */*', 'X-Session-Token': sessionToken } });
    const songs = (searchData && searchData.songs) || [];
    if (!songs.length) return res.status(404).json({ Status: false, error: 'Lagu tidak ditemukan!' });
    const results = songs.slice(0, 12).map(s => {
      let thumb = '';
      if (s.thumbnail) {
        const c = makeCode();
        storeSet('resimg:' + c, { u: s.thumbnail, k: 'img', ref: 'https://spotdown.org/' }, 7200);
        thumb = 'https://api.jhx.my.id/resimg/' + c + '.jpg';
      }
      return { title: s.title || '', artist: s.artist || '', duration: s.duration || '', url: s.url || '', thumbnail: thumb };
    });
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'search', data: results });
  } catch (e) { res.status(500).json({ Status: false, error: e.response?.data || e.message }); }
});

app.post('/sp-download', async (req, res) => {
  try {
    const extra = req.body || {};
    const url = extra.url || '';
    const titleIn = extra.title;
    const artistIn = extra.artist;
    if (!url || !/open\.spotify\.com\/track\//i.test(url)) return res.status(400).json({ Status: false, error: 'URL Spotify track tidak valid!' });
    const sessionToken = await spotSession();
    const { data: dlData } = await axios.post('https://spotdown.org/apinew/download', { url }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'X-Session-Token': sessionToken } });
    if (!dlData || !dlData.success || !dlData.downloadUrl) throw new Error('Gagal mendapatkan link download spotdown');
    const code = makeCode();
    const prettyName = titleIn ? 'JHSP_' + (artistIn ? cleanTitle(artistIn) + '_-_' : '') + cleanTitle(titleIn) : 'JHSP_track_' + code;
    storeSet('resaud:' + code, { u: dlData.downloadUrl, k: 'aud', p: prettyName, fn: prettyName, ref: 'https://spotdown.org/' }, 240);
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'download', data: { url: 'https://api.jhx.my.id/resaud/' + code + '.mp3', filename: prettyName + '.mp3', spotify_url: url } });
  } catch (e) { res.status(500).json({ Status: false, error: e.response?.data || e.message }); }
});

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
    storeSet('resimg:' + code, { u: result, k: 'img', p: 'JHSwap', ref: 'https://vidmage.ai/' }, 7200);
    res.json({ Developer: 'JH a.k.a Dhika', kesayangan: 'Fiony Alveria♡', status: true, data: { url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', filename: 'JHSwap_' + code + '.jpg' } });
  } catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

app.post('/yt-search', async (req, res) => {
  try {
    const q = (req.body && req.body.q) || '';
    if (!q) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Kata kunci pencarian kosong!' });
    
    const { exec } = require('child_process');
    const cmd = `yt-dlp --flat-playlist --ignore-errors -J "ytsearch25:${q.replace(/"/g, '')}"`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Gagal mencari di YouTube: ' + error.message });
      
      try {
        const data = JSON.parse(stdout);
        const results = (data.entries || []).slice(0, 12).map(v => {
          let thumb = '';
          if (v.thumbnail || v.thumbnails) {
            const thumbUrl = v.thumbnail || (v.thumbnails && v.thumbnails[v.thumbnails.length - 1] && v.thumbnails[v.thumbnails.length - 1].url);
            if (thumbUrl) {
              const c = makeCode();
              storeSet('resimg:' + c, { u: thumbUrl, k: 'img', ref: 'https://www.youtube.com/' }, 7200);
              thumb = 'https://api.jhx.my.id/resimg/' + c + '.jpg';
            }
          }
          return {
            id: v.id || v.url,
            title: v.title || '',
            artist: v.channel || v.uploader || 'Unknown',
            duration: v.duration ? (Math.floor(v.duration / 60) + ':' + String(v.duration % 60).padStart(2, '0')) : '0:00',
            url: v.url || (v.id ? 'https://www.youtube.com/watch?v=' + v.id : ''),
            thumbnail: thumb
          };
        });
        res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'search', data: results });
      } catch (e) {
        res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Parse error: ' + e.message });
      }
    });
  } catch (e) {
    res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message });
  }
});

app.post('/yt-download', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    const format = (req.body && req.body.format) || 'best';
    if (!url || !/youtube\.com|youtu\.be/.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL YouTube tidak valid!' });
    
    const isAudio = format === 'audio';
    const code = makeCode();
    const tmpDir = path.join(__dirname, 'tmp', 'jh-yt-' + code);
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const metaCmd = 'yt-dlp -J --no-warnings "' + url + '"';
    exec(metaCmd, { maxBuffer: 1024 * 1024 * 15, timeout: 60000 }, (err, stdout) => {
      if (err) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Gagal metadata: ' + err.message });
      }
      
      try {
        const meta = JSON.parse(stdout);
        const title = meta.title || 'Unknown';
        const formats = meta.formats || [];
        const prettyName = 'JHYT_' + cleanTitle(title);
        
        let dlCmd, outputFile, route, ext;
        if (isAudio) {
          outputFile = path.join(tmpDir, 'audio.mp3');
          dlCmd = 'yt-dlp --extract-audio --audio-format mp3 --audio-quality 0 --no-warnings -o "' + outputFile + '" "' + url + '"';
          route = 'resaud';
          ext = 'mp3';
        } else {
          const targetHeight = parseInt(format) || 720;
          outputFile = path.join(tmpDir, 'video.mp4');
          dlCmd = 'yt-dlp -f "bv*[height<=' + targetHeight + ']+ba/b[height<=' + targetHeight + ']/best[height<=' + targetHeight + ']/best" --merge-output-format mp4 --no-warnings -o "' + outputFile + '" "' + url + '"';
          route = 'resvid';
          ext = 'mp4';
        }
        
        exec(dlCmd, { timeout: 300000 }, (dlErr) => {
          if (dlErr) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Download gagal: ' + dlErr.message });
          }
          if (!fs.existsSync(outputFile)) {
            const altFiles = fs.readdirSync(tmpDir);
            const altFile = altFiles.find(f => /\.(mp4|webm|mkv)$/i.test(f));
            if (altFile) {
              const altPath = path.join(tmpDir, altFile);
              fs.renameSync(altPath, outputFile);
            } else {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'File output tidak ditemukan setelah download' });
            }
          }
          
          const availableQualities = [...new Set(formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height + 'p'))].sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 5);
          
          let actualHeight = 720;
          if (!isAudio) {
            const target = parseInt(format) || 720;
            const match = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height).sort((a, b) => Math.abs(a.height - target) - Math.abs(b.height - target))[0];
            if (match) actualHeight = match.height;
          }
          
          storeSet(route + ':' + code, { filePath: outputFile, k: isAudio ? 'aud' : 'vid', p: prettyName, fn: prettyName, ref: 'https://www.youtube.com/' }, 7200);
          setTimeout(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }, 7200 * 1000);
          
          return res.json({
            Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'download',
            data: {
              url: 'https://api.jhx.my.id/' + route + '/' + code + '.' + ext,
              filename: prettyName + '.' + ext,
              youtube_url: url,
              format: isAudio ? 'audio (mp3 192kbps)' : actualHeight + 'p',
              available_qualities: isAudio ? ['audio'] : availableQualities
            }
          });
        });
      } catch (e) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Parse error: ' + e.message });
      }
    });
  } catch (e) {
    res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message });
  }
});
app.post('/tk-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/(tiktok\.com|vt\.tiktok\.com)/i.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL TikTok tidak valid!' });

    const crypto = require('crypto');
    const TK_UA = 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.181 Mobile Safari/537.36';

    async function getXVerify() {
      const { data: tokenData } = await axios.post('https://snaptik.app/api/token', {}, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', 'User-Agent': TK_UA } });
      const tokenId = tokenData && tokenData.id;
      const pValue = tokenData && tokenData.p;
      if (!tokenId || !pValue) throw new Error('Gagal dapetin ID token dari SnapTik');
      const key = crypto.createHash('sha256').update('sn4pt1k_v3r1fy2026:' + tokenId).digest();
      const buf = Buffer.from(pValue, 'base64');
      const iv = buf.slice(0, 16);
      const encrypted = buf.slice(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      const parsedData = JSON.parse(decrypted);
      let solved = 0;
      switch (parsedData.t) {
        case 'b': solved = ((parsedData.a ^ parsedData.b) >> parsedData.s) & 255; break;
        case 'r': solved = parsedData.n.reduce((h, f) => h + f, 0) * 2 + 1; break;
        case 'c': solved = parsedData.w.charCodeAt(parsedData.i) * parsedData.m; break;
        case 'm': solved = ((parsedData.a + parsedData.b) % 100) * parsedData.c; break;
        case 'n': solved = parsedData.a * parsedData.b + parsedData.b * parsedData.c + parsedData.c * parsedData.a - parsedData.a; break;
        default: throw new Error('Unknown challenge');
      }
      return tokenId + ':' + solved + ':' + parsedData._e + ':' + parsedData._h;
    }

    const xVerify = await getXVerify();
    const { data: extractData } = await axios.get('https://snaptik.app/api/extract?url=' + encodeURIComponent(url), { headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Verify': xVerify, 'User-Agent': TK_UA, 'Referer': 'https://snaptik.app/' } });
    const result = extractData.data;
    if (!result) throw new Error('Gagal ekstraksi data TikTok');

    if (result.hdDownloadUrl) {
      const hdApiUrl = result.hdDownloadUrl.startsWith('/') ? 'https://snaptik.app' + result.hdDownloadUrl : result.hdDownloadUrl;
      try {
        const xVerifyHD = await getXVerify();
        const { data: hdData } = await axios.get(hdApiUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Verify': xVerifyHD, 'User-Agent': TK_UA, 'Referer': 'https://snaptik.app/' } });
        if (!hdData.error && hdData.url) result.hdDownloadUrl = hdData.url;
      } catch (err) {}
    }

    function reg(route, target, kind) {
      const code = makeCode();
      storeSet(route + ':' + code, { u: target, k: kind, ref: 'https://snaptik.app/' }, 3600);
      return 'https://api.jhx.my.id/' + route + '/' + code + (kind === 'vid' ? '.mp4' : '.jpg');
    }
    function fmt(n) {
      n = n || 0;
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }
    function dur(s) { return Math.floor((s || 0) / 60) + ':' + String((s || 0) % 60).padStart(2, '0'); }

    const data = {
      id: result.id || '',
      type: result.type || 'video',
      title: result.title || '',
      thumbnail: result.thumbnail ? reg('resimg', result.thumbnail, 'img') : '',
      videoDuration: dur(result.videoDuration),
      author: {
        name: (result.author && result.author.name) || '',
        username: (result.author && result.author.username) || '',
        avatar: result.author && result.author.avatar ? reg('resimg', result.author.avatar, 'img') : ''
      },
      stats: {
        playCount: fmt(result.stats && result.stats.playCount),
        commentCount: fmt(result.stats && result.stats.commentCount),
        shareCount: fmt(result.stats && result.stats.shareCount)
      }
    };

    if (result.type === 'carousel') {
      data.video = { url: reg('resvid', result.downloadUrl, 'vid'), filename: 'JHTK_slide_' + (result.id || makeCode()) + '.mp4' };
      data.images = (result.images || []).map((im, i) => ({
        url: reg('resimg', im.downloadUrl || im.url, 'img'),
        filename: 'JHTK_img_' + (result.id || makeCode()) + '_' + (i + 1) + '.jpg'
      }));
    } else {
      let vNormal = result.downloadUrl || '';
      let vHd = result.hdDownloadUrl || '';
      if (vNormal && vHd) {
        const sz = await Promise.all([getSize(vNormal), getSize(vHd)]);
        if (sz[0] > 0 && sz[1] > 0 && sz[1] < sz[0]) { const tmp = vNormal; vNormal = vHd; vHd = tmp; }
      }
      data.variants = [];
      if (vHd) data.variants.push({ quality: 'HD', url: reg('resvid', vHd, 'vid'), filename: 'JHTK_vid_HD_' + (result.id || makeCode()) + '.mp4' });
      if (vNormal) data.variants.push({ quality: 'Normal', url: reg('resvid', vNormal, 'vid'), filename: 'JHTK_vid_' + (result.id || makeCode()) + '.mp4' });
    }

    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, data });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.response?.data || e.message }); }
});


app.post('/hd-image', async (req, res) => {
  try {
    const { b64, ct, scale } = req.body || {};
    if (!b64) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Gambar kosong!' });
    const mime = ct || 'image/png';
    if (!/^image\//i.test(mime)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'File harus berupa gambar!' });
    const imgBuf = Buffer.from(b64, 'base64');
    if (imgBuf.length > 8 * 1024 * 1024) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Ukuran maksimal 8MB!' });
    const is4x = String(scale) === '4';
    let outBuf = null, outCt = '';

    if (is4x) {
      const crypto = require('crypto');
      const jantung = {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.img2go.com',
        'Referer': 'https://www.img2go.com/',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      let cookieMap = {};
      const api = {
        async req(method, url, data, config = {}) {
          const headers = { ...jantung, ...(config.headers || {}) };
          const cookieStr = Object.entries(cookieMap).map(([k, v]) => k + '=' + v).join('; ');
          if (cookieStr) headers['Cookie'] = cookieStr;
          if (cookieMap['XSRF-TOKEN']) headers['X-XSRF-TOKEN'] = decodeURIComponent(cookieMap['XSRF-TOKEN']);
          const r = await axios({ method, url, data, headers, responseType: config.responseType, timeout: 60000, validateStatus: () => true });
          (r.headers['set-cookie'] || []).forEach(c => {
            const pair = c.split(';')[0];
            const eqIdx = pair.indexOf('=');
            if (eqIdx > -1) cookieMap[pair.substring(0, eqIdx)] = pair.substring(eqIdx + 1);
          });
          return r;
        },
        post(url, data, config) { return this.req('POST', url, data, config); },
        get(url, config) { return this.req('GET', url, null, config); }
      };
      const pollJob = async (url, condFn, maxRetries = 30, delay = 2500) => {
        for (let i = 0; i < maxRetries; i++) {
          await sleep(delay);
          const { data } = await api.get(url);
          const result = condFn(data);
          if (result) return result;
        }
        throw new Error('Timeout di step: ' + url);
      };

      const fileName = 'JH_' + Date.now() + '.jpg';
      await api.get('https://dragon.img2go.com/api/user');
      const { data: initRes } = await api.post('https://dragon.img2go.com/api/jobs', { operation: 'com.img2go.system.initialupload', async: true, conversion: [{ target: 'mirror', category: 'mirror', options: {} }] });
      if (!initRes || !initRes.sat) throw new Error('IMG2GO INIT: ' + JSON.stringify(initRes).slice(0, 200));
      const initialJobId = initRes.sat.id_job;
      const upServerData = await pollJob('https://dragon.img2go.com/api/jobs/' + initialJobId + '?async=true', d => d && d.server && d.id && d.token ? d : null, 15, 1500);
      const { data: wfRes } = await api.post('https://dragon.img2go.com/api/workflows', { origin: 'auto' });

      const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const payload = Buffer.concat([
        Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + fileName + '"\r\nContent-Type: ' + mime + '\r\n\r\n'),
        imgBuf,
        Buffer.from('\r\n--' + boundary + '--\r\n')
      ]);
      const upRes = await api.post(upServerData.server + '/upload-file/' + upServerData.id, payload, { headers: { 'X-Oc-Token': upServerData.token, 'X-Oc-Upload-Uuid': (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)), 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
      if (!upRes || upRes.status >= 400) throw new Error('IMG2GO UPLOAD gagal, status ' + (upRes ? upRes.status : '?'));

      const uploadedFile = await pollJob('https://dragon.img2go.com/api/jobs/' + initialJobId + '?async=true', d => d && d.status && d.status.code === 'completed' && d.output && d.output.length > 0 ? d.output[0] : null);
      const { data: bindRes } = await api.post('https://dragon.img2go.com/api/workflows/' + wfRes.hash + '/upload', { files: [{ filename: fileName, extension: ext, contentType: mime, size: uploadedFile.size, uri: uploadedFile.uri, metadata: { thumbnail_available: true, original_filename: fileName, original_content_type: mime, original_size: uploadedFile.size } }] });
      const { data: upscaleInit } = await api.post('https://dragon.img2go.com/api/jobs', { operation: 'com.img2go.upscaleimage', async: true, workflow_hash: wfRes.hash, input_file_ids: [bindRes.file_groups[0].latest_version.file_id] });
      if (!upscaleInit || !upscaleInit.sat) throw new Error('IMG2GO UPSCALE INIT: ' + JSON.stringify(upscaleInit).slice(0, 200));
      const finalJobId = await pollJob('https://dragon.img2go.com/api/jobs/' + upscaleInit.sat.id_job + '?async=true', d => d && d.id ? d.id : null, 15, 1500);
      await api.post('https://dragon.img2go.com/api/jobs/' + finalJobId + '/input', [{ type: 'remote', source: uploadedFile.uri, filename: fileName }]);
      await api.post('https://dragon.img2go.com/api/jobs/' + finalJobId + '/conversions', { target: 'ai_upscale', category: 'operation', options: { allow_multiple_outputs: true, upscale_factor: '4x' }, metadata: { Producer: 'Img2Go' } });
      const finalOutput = await pollJob('https://dragon.img2go.com/api/jobs/' + finalJobId, d => d && d.status && d.status.code === 'completed' && d.output && d.output.length > 0 ? d.output[0] : null, 40, 3000);
      const finalImgRes = await api.get(finalOutput.uri, { responseType: 'arraybuffer' });
      outBuf = Buffer.from(finalImgRes.data);
      outCt = finalImgRes.headers['content-type'] || 'image/jpeg';
    } else {
      const jantung2 = {
        'accept': '*/*',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'origin': 'https://www.photiu.ai',
        'referer': 'https://www.photiu.ai/id/image-upscaler',
        'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
      };
      const ext2 = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const boundary2 = '----jhform' + makeCode() + makeCode() + Date.now();
      const body2 = Buffer.concat([
        Buffer.from('--' + boundary2 + '\r\nContent-Disposition: form-data; name="upfile"; filename="input.' + ext2 + '"\r\nContent-Type: ' + mime + '\r\n\r\n'),
        imgBuf,
        Buffer.from('\r\n--' + boundary2 + '\r\nContent-Disposition: form-data; name="factor"\r\n\r\n2\r\n--' + boundary2 + '--\r\n')
      ]);
      const up2 = await axios.post('https://www.photiu.ai/api/upscale', body2, {
        headers: { ...jantung2, 'Content-Type': 'multipart/form-data; boundary=' + boundary2 },
        responseType: 'arraybuffer',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000,
        validateStatus: () => true
      });
      outCt = up2.headers['content-type'] || '';
      outBuf = Buffer.from(up2.data);
    }

    if (!outBuf || !/^image\//i.test(outCt)) {
      let errBody = '';
      try { errBody = outBuf.toString('utf8', 0, 300); } catch (e) {}
      return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Upscale gagal: ' + errBody });
    }

    const code = makeCode();
    const prettyName = 'JHHD_x' + (is4x ? '4' : '2') + '_' + code;
    storeSet('resimg:' + code, { b64: outBuf.toString('base64'), ct: outCt, k: 'img', p: 'JHHD', fn: prettyName }, 7200);

    res.json({
      Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true,
      data: { url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', filename: prettyName + '.jpg', size: outBuf.length, sizeHuman: human(outBuf.length), contentType: outCt, scale: is4x ? 'x4' : 'x2' }
    });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message }); }
});

app.post('/lyrics-search', async (req, res) => {
  try {
    const q = (req.body && req.body.q) || '';
    if (!q) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Kata kunci pencarian kosong!' });
    const jantung = {
      'Accept': 'application/json, text/html, application/xhtml+xml, */*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Origin': 'https://genius.com',
      'Referer': 'https://genius.com/search?q=' + encodeURIComponent(q)
    };
    const { data } = await axios.get('https://genius.com/api/search/multi?per_page=5&q=' + encodeURIComponent(q), { headers: jantung });
    const songSection = ((data.response && data.response.sections) || []).find(s => s.type === 'song');
    if (!songSection || !songSection.hits || !songSection.hits.length) return res.status(404).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Lagu tidak ditemukan!' });
    const results = songSection.hits.map(h => {
      let thumb = '';
      const t = h.result && h.result.song_art_image_thumbnail_url;
      if (t) {
        const c = makeCode();
        storeSet('resimg:' + c, { u: t, k: 'img', ref: 'https://genius.com/' }, 7200);
        thumb = 'https://api.jhx.my.id/resimg/' + c + '.jpg';
      }
      let slug = '';
      try { slug = new URL(h.result.url).pathname; } catch (e) {}
      return { id: h.result.id, title: h.result.title || '', artist: h.result.artist_names || '', thumbnail: thumb, slug };
    });
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'search', data: results });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.response?.data || e.message }); }
});

app.post('/lyrics-detail', async (req, res) => {
  try {
    const q = (req.body && req.body.q) || '';
    if (!q) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Parameter kosong!' });
    const jantung = {
      'Accept': 'application/json, text/html, application/xhtml+xml, */*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    };
    let url = q;
    if (/^\d+$/.test(q)) {
      const { data: apiData } = await axios.get('https://genius.com/api/songs/' + q, { headers: jantung });
      url = apiData.response && apiData.response.song && apiData.response.song.url;
      if (!url) throw new Error('ID tidak valid');
    } else if (!q.startsWith('http')) {
      url = 'https://genius.com/' + q.replace(/^\//, '');
    }
    const { data } = await axios.get(url, { headers: jantung });
    const $ = cheerio.load(data);
    let lyrics = '';
    $('div[data-lyrics-container="true"]').each((i, el) => {
      let html = $(el).html();
      html = html.replace(/<br\s*\/?>/gi, '\n');
      html = html.replace(/<[^>]*>?/gm, '');
      lyrics += html.trim() + '\n\n';
    });
    lyrics = lyrics.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const firstBracket = lyrics.indexOf('[');
    if (firstBracket !== -1 && firstBracket < 500) lyrics = lyrics.substring(firstBracket);
    else lyrics = lyrics.replace(/^[\s\S]*?Lyrics\s*/i, '');
    lyrics = lyrics.replace(/\d*Embed$/, '');
    lyrics = lyrics.replace(/\[.*?\]\n*/g, '');
    lyrics = lyrics.replace(/\n{3,}/g, '\n\n').trim();
    if (!lyrics) return res.status(404).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Lirik kosong!' });
    let fullTitle = $('title').text() || '';
    let artist = 'Unknown', title = 'Unknown';
    fullTitle = fullTitle.replace(' Lyrics | Genius Lyrics', '').trim();
    const splitIndex = fullTitle.indexOf(' – ');
    if (splitIndex !== -1) { artist = fullTitle.substring(0, splitIndex).trim(); title = fullTitle.substring(splitIndex + 3).trim(); }
    else title = fullTitle;
    let thumb = '';
    const rawThumb = $('meta[property="og:image"]').attr('content') || '';
    if (rawThumb) {
      const c = makeCode();
      storeSet('resimg:' + c, { u: rawThumb, k: 'img', ref: 'https://genius.com/' }, 7200);
      thumb = 'https://api.jhx.my.id/resimg/' + c + '.jpg';
    }
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'detail', data: { title, artist, thumbnail: thumb, lyrics } });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.response?.data || e.message }); }
});


app.post('/th-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/(threads\.com|threads\.net)/i.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL Threads tidak valid!' });

    const jantung = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; 23021RAA2Y Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.181 Mobile Safari/537.36',
      'Referer': 'https://www.threadsdl.app/id/'
    };

    const { data } = await axios.post('https://www.threadsdl.app/api/threads', { url }, { headers: jantung, timeout: 60000 });
    if (!data || !data.medias) throw new Error('Data media kosong atau link invalid!');

    const results = data.medias.map(m => {
      if (m.mediaType === 2 && m.videos && m.videos.length > 0) {
        return { type: 'video', url: m.videos[0].url, thumbnail: m.cover || '' };
      } else if (m.mediaType === 1 && m.images && m.images.length > 0) {
        const hdImg = m.images.reduce((prev, curr) => (prev.width > curr.width) ? prev : curr);
        return { type: 'image', url: hdImg.url };
      }
      return null;
    }).filter(Boolean);

    if (!results.length) throw new Error('Gagal ekstrak media dari response!');

    function reg(target, kind, fn) {
      const code = makeCode();
      const route = kind === 'vid' ? 'resvid' : 'resimg';
      storeSet(route + ':' + code, { u: target, k: kind, fn: fn || ('JHTH_' + (kind === 'vid' ? 'vid_' : 'img_') + code), ref: 'https://www.threadsdl.app/' }, 3600);
      return { url: 'https://api.jhx.my.id/' + route + '/' + code + (kind === 'vid' ? '.mp4' : '.jpg'), code };
    }

    const media = results.map((m, i) => {
      const kind = m.type === 'video' ? 'vid' : 'img';
      const code = makeCode();
      const route = kind === 'vid' ? 'resvid' : 'resimg';
      const base = (kind === 'vid' ? 'JHTH_vid_' : 'JHTH_img_') + code + (kind === 'img' ? '_' + (i + 1) : '');
      storeSet(route + ':' + code, { u: m.url, k: kind, fn: base, ref: 'https://www.threadsdl.app/' }, 3600);
      const result = {
        type: m.type,
        url: 'https://api.jhx.my.id/' + route + '/' + code + (kind === 'vid' ? '.mp4' : '.jpg'),
        filename: base + (kind === 'vid' ? '.mp4' : '.jpg')
      };
      if (m.thumbnail && !/\.mp4(\?|$)|\/video\?/i.test(m.thumbnail)) {
        const t = reg(m.thumbnail, 'img', 'JHTH_thumb_' + code);
        result.thumbnail = t.url;
      }
      return result;
    });

    res.json({
      Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true,
      data: {
        username: data.username || 'Unknown',
        profilePic: data.avatar ? reg(data.avatar, 'img').url : '',
        caption: data.text || '',
        media
      }
    });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.response?.data || e.message }); }
});

function jhPrefix(ref) {
  ref = ref || '';
  if (ref.includes('snaptik') || ref.includes('tiktok')) return 'JHTK';
  if (ref.includes('x.com') || ref.includes('twitter') || ref.includes('twimg')) return 'JHTW';
  if (ref.includes('youtube') || ref.includes('youtu.be')) return 'JHYT';
  if (ref.includes('spotify')) return 'JHSP';
  if (ref.includes('threadsdl') || ref.includes('threadster')) return 'JHTH';
  if (ref.includes('photiu') || ref.includes('img2go')) return 'JHHD';
  if (ref.includes('genius')) return 'JHLY';
  return 'JHIG';
}

async function pinProbe(u, hdrs) {
  try {
    const h = await axios.head(u, { headers: hdrs, timeout: 8000, maxRedirects: 3 });
    const l = parseInt(h.headers['content-length'] || '0', 10);
    if (!l) return null;
    return { size: l, sizeHuman: l >= 1048576 ? (l / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(l / 1024)) + ' KB' };
  } catch (e) { return null; }
}

app.post('/pin-search', async (req, res) => {
  try {
    const q = (req.body && req.body.q) || '';
    const limit = Math.min(parseInt(req.body && req.body.limit) || 10, 50);
    if (!q) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Query kosong!' });
    const jantung = {
      'screen-dpr': '4',
      'x-pinterest-pws-handler': 'www/search/[scope].js',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.pinterest.com/'
    };
    const encoded = encodeURIComponent(JSON.stringify({ options: { query: q } }));
    const r = await axios.head('https://www.pinterest.com/resource/BaseSearchResource/get/?data=' + encoded, { headers: jantung, validateStatus: () => true, timeout: 30000 });
    const linkHeader = r.headers.link || '';
    const regex = /<\s*(https:\/\/i\.pinimg\.com\/[^>]+)\s*>\s*;\s*rel=preload;\s*as=image/gi;
    const matches = [...new Set([...linkHeader.matchAll(regex)].map(v => v[1]))].slice(0, limit);
    if (!matches.length) return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Zonk wak! Gak nemu image dari Pinterest.' });
    const probes = await Promise.all(matches.map(u => pinProbe(u, jantung)));
    const images = matches.map((imgUrl, idx) => {
      const code = makeCode();
      const pr = probes[idx] || null;
      storeSet('resimg:' + code, { u: imgUrl, k: 'img', p: 'JHPIN', ref: 'https://www.pinterest.com/' }, 3600);
      return { url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', original: imgUrl, size: pr ? pr.size : null, sizeHuman: pr ? pr.sizeHuman : null };
    });
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'search', data: { query: q, total: images.length, images } });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message }); }
});

app.post('/pin-download', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/(pinterest\.com|pin\.it)/i.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL Pinterest tidak valid!' });
    const jantung = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.pinterest.com/'
    };
    const r = await axios.get(url, { headers: jantung, maxRedirects: 5, timeout: 30000 });
    const html = String(r.data);
    const pageUrl = (r.request && r.request.res && r.request.res.responseUrl) || url;
    const decodeEscapes = s => String(s).replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\u003D/g, '=').replace(/\\u00253A/g, ':').replace(/\\u00252F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
    const decoded = decodeEscapes(html);
    const extractMeta = (rawHtml, prop) => {
      const escProp = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp('<meta[^>]+property=["\']' + escProp + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
        new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + escProp + '["\']', 'i'),
        new RegExp('<meta[^>]+name=["\']' + escProp + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
        new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']' + escProp + '["\']', 'i')
      ];
      for (const re of patterns) { const m = rawHtml.match(re); if (m && m[1]) return m[1]; }
      const jm = rawHtml.match(new RegExp('"' + escProp + '"\\s*:\\s*"([^"]+)"', 'i'));
      return (jm && jm[1]) || null;
    };
    const cleanText = s => String(s).replace(/\s+/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
    const title = cleanText(extractMeta(decoded, 'og:title') || extractMeta(decoded, 'twitter:title') || 'Pinterest Media');
    const safeName = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'JHPIN';
    const cleanMediaUrl = u => {
      try {
        let cl = String(u).trim();
        const em = cl.match(/^(.+?\.(?:jpg|jpeg|png|webp|mp4|m3u8))/i);
        if (em) cl = em[1];
        cl = cl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        const ur = new URL(cl); ur.search = '';
        return ur.toString();
      } catch (e) { const em = String(u).match(/https:\/\/(?:i|v\d+)\.pinimg\.com\/.+?\.(?:jpg|jpeg|png|webp|mp4|m3u8)/i); return em ? em[0] : u; }
    };
    const extractMatches = (str, regex) => [...str.matchAll(regex)].map(v => cleanMediaUrl(v[0]));
    const mp4Matches = [...new Set([
      ...extractMatches(decoded, /https:\/\/v\d+\.pinimg\.com\/videos\/[^"'\\\s<]+\.mp4/gi),
      ...extractMatches(decoded, /https:\/\/v\d+\.pinimg\.com\/videos\/iht\/[^"'\\\s<]+\.mp4/gi),
      ...extractMatches(decoded, /https:\/\/v\d+\.pinimg\.com\/videos\/mc\/[^"'\\\s<]+\.mp4/gi)
    ])];
    if (mp4Matches.length > 0) {
      const pickBestMp4 = urls => {
        for (const p of ['1080', '720', '564', '540', '480']) {
          const f = urls.find(u => new RegExp('(?:/|_)' + p + '[pP]?\\b').test(u));
          if (f) return f;
        }
        return urls.find(u => /\/720p\//i.test(u)) || urls[0];
      };
      const inferQuality = u => {
        if (/1080/i.test(u)) return '1080p';
        if (/720/i.test(u)) return '720p';
        if (/540/i.test(u)) return '540p';
        if (/480/i.test(u)) return '480p';
        return 'auto';
      };
      const chosen = pickBestMp4(mp4Matches);
      const code = makeCode();
      const probeVid = await pinProbe(chosen, jantung);
      storeSet('resvid:' + code, { u: chosen, k: 'vid', p: 'JHPIN', fn: 'JHPIN_' + safeName, ref: 'https://www.pinterest.com/' }, 3600);
      return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'download', data: { type: 'video', title, quality: inferQuality(chosen), url: 'https://api.jhx.my.id/resvid/' + code + '.mp4', filename: 'JHPIN_' + safeName + '.mp4', source: pageUrl, size: probeVid ? probeVid.size : null, sizeHuman: probeVid ? probeVid.sizeHuman : null } });
    }
    const primaryImage = cleanMediaUrl(extractMeta(decoded, 'og:image') || extractMeta(decoded, 'twitter:image') || '');
    let rawImageMatches = [...new Set([
      ...extractMatches(decoded, /https:\/\/i\.pinimg\.com\/originals\/[^"'\\\s<>()]+?\.(?:jpg|jpeg|png|webp)/gi),
      ...extractMatches(decoded, /https:\/\/i\.pinimg\.com\/736x\/[^"'\\\s<>()]+?\.(?:jpg|jpeg|png|webp)/gi),
      ...extractMatches(decoded, /https:\/\/i\.pinimg\.com\/564x\/[^"'\\\s<>()]+?\.(?:jpg|jpeg|png|webp)/gi),
      ...extractMatches(decoded, /https:\/\/i\.pinimg\.com\/474x\/[^"'\\\s<>()]+?\.(?:jpg|jpeg|png|webp)/gi)
    ])].filter(u => /^https:\/\/i\.pinimg\.com\//i.test(u) && !/logo|favicon|default|75x75|60x60|30x30/i.test(u));
    const getImageKey = u => { const m = String(u).match(/\/([a-f0-9]{24,64})\.(?:jpg|jpeg|png|webp)$/i); return (m && m[1]) || String(u); };
    const prioritizeImages = urls => {
      const uniq = [...new Set(urls)];
      return [].concat(
        uniq.filter(u => /\/originals\//i.test(u)),
        uniq.filter(u => /\/736x\//i.test(u)),
        uniq.filter(u => /\/564x\//i.test(u)),
        uniq.filter(u => /\/474x\//i.test(u))
      );
    };
    let images = primaryImage ? [primaryImage].concat(rawImageMatches.filter(u => getImageKey(u) === getImageKey(primaryImage))) : rawImageMatches;
    images = prioritizeImages(images);
    if (images.length > 1) {
      const grouped = {};
      for (const u of images) { const k = getImageKey(u); if (!grouped[k]) grouped[k] = []; grouped[k].push(u); }
      const bestGroup = Object.values(grouped).sort((a, b) => b.length - a.length)[0] || [];
      images = prioritizeImages(bestGroup);
    }
    const finalImage = images[0];
    if (!finalImage) return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Zonk wak! Gak nemu media valid.' });
    const probeImg = await pinProbe(finalImage, jantung);
    const code = makeCode();
    storeSet('resimg:' + code, { u: finalImage, k: 'img', p: 'JHPIN', fn: 'JHPIN_' + safeName, ref: 'https://www.pinterest.com/' }, 3600);
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'download', data: { type: 'image', title, url: 'https://api.jhx.my.id/resimg/' + code + '.jpg', filename: 'JHPIN_' + safeName + '.jpg', source: pageUrl, size: probeImg ? probeImg.size : null, sizeHuman: probeImg ? probeImg.sizeHuman : null } });
  } catch (e) { res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message }); }
});


app.post('/fb-downloader', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/(facebook\.com|fb\.watch|fb\.com)/i.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL Facebook tidak valid!' });
    const jantung = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const apiUrl = 'https://serverless-tooly-gateway-6n4h522y.ue.gateway.dev/facebook/video?url=' + encodeURIComponent(url);
    const { data } = await axios.get(apiUrl, { headers: jantung, timeout: 30000 });
    if (!data || !data.success) return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Gagal nyedot data dari API Facebook.' });
    let rawTitle = data.title || 'Unknown';
    let caption = rawTitle, author = 'Unknown';
    if (rawTitle.includes('|')) { const parts = rawTitle.split('|'); author = parts.pop().trim(); caption = parts.join('|').trim(); }
    const safeName = String(caption).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'JHFB';
    const media = [];
    const pushVid = (q, v) => {
      if (!v || !v.url) return;
      const code = makeCode();
      storeSet('resvid:' + code, { u: v.url, k: 'vid', p: 'JHFB', fn: 'JHFB_' + safeName + '_' + q, ref: 'https://www.facebook.com/' }, 3600);
      media.push({ quality: q, size: v.size || null, url: 'https://api.jhx.my.id/resvid/' + code + '.mp4', filename: 'JHFB_' + safeName + '_' + q + '.mp4' });
    };
    if (data.videos) { pushVid('HD', data.videos.hd); pushVid('SD', data.videos.sd); }
    if (!media.length) return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Media kosong dari API!' });
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'download', data: { caption, author, media } });
  } catch (e) {
    res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message });
  }
});


app.post('/ads-skipper', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'URL tidak valid!' });
    const izenUrl = 'https://izen.lol';
    const siteKey = '0x4AAAAAADNEi_2N24gpQqY0';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const capHeaders = { 'Content-Type': 'application/json' };
    let capInit;
    try {
      capInit = await axios.post('https://cap.jhx.my.id/api/createTask', { url: izenUrl, type: 'turnstile-min', sitekey: siteKey }, { headers: capHeaders, timeout: 30000 });
    } catch (e) {
      return res.status(502).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Solver captcha tidak reachable: ' + e.message });
    }
    const jobId = capInit.data && capInit.data.jobId;
    if (!jobId) return res.status(502).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Solver gagal buat task (jobId kosong).' });
    let cfToken = null, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      let poll;
      try { poll = await axios.post('https://cap.jhx.my.id/api/getResult', { jobId }, { headers: capHeaders, timeout: 15000 }); } catch (e) { continue; }
      const d = poll.data;
      if (d && d.status === 'ready' && d.solution && d.solution.token) {
        cfToken = d.solution.token;
        if (d.solution.userAgent) ua = d.solution.userAgent;
        break;
      }
    }
    if (!cfToken) return res.status(504).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Captcha solver timeout (>2 menit). Coba lagi.' });
    const jantung = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Origin': izenUrl,
      'Referer': izenUrl + '/',
      'User-Agent': ua
    };
    let bypassRes;
    try {
      const br = await axios.post(izenUrl + '/api/bypass', { url, captchaToken: cfToken }, { headers: jantung, timeout: 60000 });
      bypassRes = br.data;
    } catch (e) {
      return res.status(502).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Izen bypass request gagal: ' + e.message });
    }
    if (!bypassRes || bypassRes.status !== 'success' || !bypassRes.result) {
      return res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Bypass gagal: ' + JSON.stringify(bypassRes) });
    }
    res.json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'bypass', data: { target_url: url, bypassed_url: bypassRes.result, time_taken: bypassRes.time || 0, is_cached: !!bypassRes.cached } });
  } catch (e) {
    res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: e.message });
  }
});


// Rate limiter: in-memory sliding window
const rateLimitMap = new Map();
const RATE_LIMIT = { perMinute: 10, perDay: 50 };

function getRateLimitInfo(ip) {
  const now = Date.now();
  const oneMinAgo = now - 60000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { timestamps: [], dailyCount: 0, lastReset: todayStart });
  }
  
  const data = rateLimitMap.get(ip);
  
  // Reset daily counter kalau udah ganti hari
  if (data.lastReset < todayStart) {
    data.dailyCount = 0;
    data.lastReset = todayStart;
  }
  
  // Sliding window: hapus timestamp yang udah >1 menit
  data.timestamps = data.timestamps.filter(t => t > oneMinAgo);
  
  return {
    perMinute: data.timestamps.length,
    perDay: data.dailyCount,
    record: () => {
      data.timestamps.push(now);
      data.dailyCount++;
    }
  };
}

function isOwnerRequest(req) {
  // Check header khusus owner
  if (req.headers['x-jh-owner'] === 'JH-OWNER-2026') return true;
  // Check message content (kalau user自称 owner)
  const msg = (req.body && req.body.message) || '';
  if (/aku\s+(obengg|dhikuyy|dhika|owner)|i'?m\s+(obengg|dhikuyy|dhika|owner)|owner\s+here/i.test(msg)) return true;
  return false;
}

app.post('/ai-chat', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const isOwner = isOwnerRequest(req);
    
    // Rate limit check (skip kalau owner)
    if (!isOwner) {
      const rl = getRateLimitInfo(ip);
      if (rl.perMinute >= RATE_LIMIT.perMinute) {
        return res.status(429).json({
          Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false,
          error: 'Rate limit: maksimal ' + RATE_LIMIT.perMinute + ' request per menit. Coba lagi dalam beberapa detik.',
          retryAfter: 60
        });
      }
      if (rl.perDay >= RATE_LIMIT.perDay) {
        return res.status(429).json({
          Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false,
          error: 'Rate limit harian: maksimal ' + RATE_LIMIT.perDay + ' request per hari. Coba lagi besok.',
          retryAfter: 86400
        });
      }
      rl.record();
    }
    
    const { message, history, images, files } = req.body || {};
    if (!message && (!images || !images.length) && (!files || !files.length)) {
      return res.status(400).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'Input kosong!' });
    }
    
    const persona = require('./ai-persona.js');
    if (!persona.apiKey || persona.apiKey === 'PASTE_TTAPI_KEY_LO_DISINI') {
      return res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'API-Key AI belum di-set di server!' });
    }
    
    const messages = [{ role: 'system', content: persona.systemPrompt }];
    if (history && Array.isArray(history)) {
      messages.push(...history.slice(-20)); // max 20 pesan terakhir
    }
    
    // Build user message (text + images + files)
    let userContent = [];
    if (message) userContent.push({ type: 'text', text: message });
    if (images && images.length) {
      images.slice(0, 3).forEach(img => { // max 3 images
        const imgData = img.startsWith('data:') ? img : 'data:image/jpeg;base64,' + img;
        userContent.push({ type: 'image_url', image_url: { url: imgData } });
      });
    }
    if (files && files.length) {
      files.slice(0, 1).forEach(file => { // max 1 file
        const fileText = typeof file === 'string' ? file : (file.content || '');
        const fileName = file.name || 'file.txt';
        userContent.push({ type: 'text', text: '[FILE: ' + fileName + ']\n' + fileText.slice(0, 8000) }); // max 8KB
      });
    }
    if (userContent.length === 0) userContent.push({ type: 'text', text: '...' });
    messages.push({ role: 'user', content: userContent });
    
    // Call TTAPI (OpenAI-compatible)
    const response = await axios.post(
      'https://api.ttapi.io/v1/chat/completions',
      { model: 'JH-Neural v1', messages, temperature: 0.7, max_tokens: 2000 },
      { headers: { 'Authorization': 'Bearer ' + persona.apiKey, 'Content-Type': 'application/json' }, timeout: 120000 }
    );
    
    const reply = response.data.choices[0].message.content;
    const usage = response.data.usage || {};
    res.json({
      Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: true, type: 'chat',
      data: { reply, model: 'JH-Neural v1', usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens }, isOwner }
    });
  } catch (e) {
    const errMsg = e.response ? (e.response.data.error ? e.response.data.error.message : e.response.data) : e.message;
    res.status(500).json({ Developer: 'JH a.k.a Dhika', Kesayangan: 'Fiony Alveria♡', Status: false, error: 'AI error: ' + errMsg });
  }
});


async function serveProxy(req, res) {
  const route = req.path.startsWith('/resvid') ? 'resvid' : req.path.startsWith('/resaud') ? 'resaud' : 'resimg';
  const code = String(req.params.code).split('.')[0];
  const item = storeGet(route + ':' + code);
  if (!item) return res.status(410).json({ error: 'link expired' });
  const kind = item.k || 'img';
  const ext = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'mp3' : 'jpg';
  const baseName = String(item.fn || ((item.p || (jhPrefix(item.ref) + '_' + kind)) + '_' + code)).replace(/[^\x20-\x7E]/g, '');

  if (item.filePath) {
    try {
      let actualPath = item.filePath;
      if (!fs.existsSync(actualPath)) {
        const dir = path.dirname(actualPath);
        const base = path.basename(actualPath, path.extname(actualPath));
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const match = files.find(f => f.startsWith(base) && /\.(mp4|mp3|webm|mkv|m4a)$/i.test(f));
          if (match) actualPath = path.join(dir, match);
        }
      }
      const stat = fs.statSync(actualPath);
      const ct = kind === 'vid' ? 'video/mp4' : kind === 'aud' ? 'audio/mpeg' : 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', 'attachment; filename="' + baseName + '.' + ext + '"');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      if (req.headers.range) {
        const parts = req.headers.range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.status(206);
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + stat.size);
        res.setHeader('Content-Length', end - start + 1);
        fs.createReadStream(actualPath, { start, end }).pipe(res);
      } else {
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(actualPath).pipe(res);
      }
    } catch (e) { console.error('[serveProxy] err:', e.message); res.status(404).json({ error: 'file not found' }); }
    return;
  }

  if (item.b64) {
    const bin = Buffer.from(item.b64, 'base64');
    res.setHeader('Content-Type', item.ct || 'image/jpeg');
    res.setHeader('Content-Length', bin.length);
    res.setHeader('Content-Disposition', 'attachment; filename="' + baseName + '.' + ext + '"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(bin);
  }

  try {
    const hdrs = { 'User-Agent': UA, 'Accept': '*/*', 'Referer': item.ref || 'https://www.instagram.com/' };
    if (req.headers.range) hdrs.Range = req.headers.range;
    const up = await axios.get(item.u, { responseType: 'stream', timeout: 60000, headers: hdrs });
    if (req.headers.range) { res.status(206); if (up.headers['content-range']) res.setHeader('Content-Range', up.headers['content-range']); }
    res.setHeader('Accept-Ranges', 'bytes');
    up.data.on('error', (e) => console.error('[STREAM]', e.message));
    const fallbackType = kind === 'vid' ? 'video/mp4' : kind === 'aud' ? 'audio/mpeg' : 'image/jpeg';
    res.setHeader('Content-Type', up.headers['content-type'] || fallbackType);
    if (up.headers['content-length']) res.setHeader('Content-Length', up.headers['content-length']);
    res.setHeader('Content-Disposition', 'attachment; filename="' + baseName + '.' + ext + '"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    up.data.pipe(res);
  } catch (e) { res.status(502).json({ error: 'upstream error' }); }
}



app.get('/resimg/:code', serveProxy);
app.get('/resvid/:code', serveProxy);
app.get('/resaud/:code', serveProxy);


function garbageCollect() {
  const now = Date.now();
  let cleaned = 0;
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(DATA_DIR, f);
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw.exp && now > raw.exp) { fs.unlinkSync(p); cleaned++; }
      } catch {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > 24 * 3600 * 1000) { fs.unlinkSync(p); cleaned++; }
      }
    }
  } catch (e) { console.error('[GC] data:', e.message); }
  try {
    const tmpBase = path.join(__dirname, 'tmp');
    if (fs.existsSync(tmpBase)) {
      for (const d of fs.readdirSync(tmpBase)) {
        const dp = path.join(tmpBase, d);
        try {
          const st = fs.statSync(dp);
          if (now - st.mtimeMs > 2 * 3600 * 1000) { fs.rmSync(dp, { recursive: true, force: true }); cleaned++; }
        } catch {}
      }
    }
  } catch (e) { console.error('[GC] tmp:', e.message); }
  console.log('[GC] sweep done — cleaned ' + cleaned + ' items');
}
setInterval(garbageCollect, 10 * 60 * 1000);
garbageCollect();

const PORT = 4100;
const server = app.listen(PORT, () => console.log('✓ JH-Tools API running on port ' + PORT));
server.on('error', (e) => { console.error('LISTEN ERROR:', e.message); process.exit(1); });
