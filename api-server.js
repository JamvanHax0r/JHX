const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');

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
    const bases = ['https://jhx.my.id/vidge', 'https://vidmage.ai'];
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
    const cmd = `yt-dlp --flat-playlist -J "ytsearch12:${q.replace(/"/g, '')}"`;
    
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
          dlCmd = 'yt-dlp -x --audio-format mp3 --audio-quality 192K --no-warnings -o "' + outputFile + '" "' + url + '"';
          route = 'resaud';
          ext = 'mp3';
        } else {
          const targetHeight = parseInt(format) || 720;
          outputFile = path.join(tmpDir, 'video.mp4');
          dlCmd = 'yt-dlp -f "bv*[height<=' + targetHeight + ']+ba/b[height<=' + targetHeight + ']" --merge-output-format mp4 --no-warnings -o "' + outputFile + '" "' + url + '"';
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
async function serveProxy(req, res) {
  const route = req.path.startsWith('/resvid') ? 'resvid' : req.path.startsWith('/resaud') ? 'resaud' : 'resimg';
  const code = String(req.params.code).split('.')[0];
  const item = storeGet(route + ':' + code);
  if (!item) return res.status(410).json({ error: 'link expired' });
  const kind = item.k || 'img';
  const ext = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'mp3' : 'jpg';
  const baseName = item.fn || ((item.p || ('JHIG_' + kind)) + '_' + code);

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
    } catch (e) { res.status(404).json({ error: 'file not found' }); }
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

const PORT = 4100;
const server = app.listen(PORT, () => console.log('✓ JH-Tools API running on port ' + PORT));
server.on('error', (e) => { console.error('LISTEN ERROR:', e.message); process.exit(1); });
