const axios = require('axios');
const cheerio = require('cheerio');

const STORE_URL = 'https://jhx.my.id/resstore';
const STORE_SECRET = 'JH-SECRET-2026';

function makeCode() {
  return Math.random().toString(36).replace(/[^a-z0-9]/gi, '').substring(0, 4).toUpperCase().padEnd(4, '7');
}

async function getSize(url) {
  try {
    const r = await axios.head(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const len = parseInt(r.headers['content-length'] || '0');
    return isNaN(len) ? 0 : len;
  } catch { return 0; }
}

async function storeLink(key, target, kind) {
  try {
    await axios.post(STORE_URL, { key, url: target, kind }, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', 'x-jh-key': STORE_SECRET }
    });
    return true;
  } catch { return false; }
}

// Daftarin URL apa pun (thumb/profile/download) jadi link pendek jhx.my.id
async function registerLink(route, target, kind) {
  if (!target) return target;
  const code = makeCode();
  const ok = await storeLink(route + ':' + code, target, kind);
  return ok ? 'https://jhx.my.id/' + route + '/' + code : target;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ Status: false, error: 'Method tidak diizinkan' });

  const formatRes = (status, data) => ({
    Skrep_by: "JH a.k.a Dhika",
    Kesayangan: "Fiony Alveria♡",
    Status: status,
    ...(status ? { data } : { error: data })
  });

  try {
    const url = (req.body && req.body.url) || '';
    if (!url || !url.includes('instagram.com')) {
      return res.status(400).json(formatRes(false, 'URL Instagram tidak valid!'));
    }

    const jantung = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'HX-Request': 'true', 'HX-Trigger': 'main-form', 'HX-Target': 'target',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const initRes = await axios.get('https://reelsvideo.io/id-4', { headers: { 'User-Agent': jantung['User-Agent'] } });
    const $init = cheerio.load(initRes.data);
    const tt = $init('#tt').val(), ts = $init('#ts').val();
    if (!tt || !ts) throw new Error('Gagal mengambil parameter tt dan ts');

    const { data: { jobId } } = await axios.post('https://cap.jhx.my.id/api/createTask', {
      url: 'https://reelsvideo.io/id-4', type: 'turnstile-min', sitekey: '0x4AAAAAACVCPoioqL3q_FXF'
    });

    let token, tries = 0;
    while (!token && tries < 25) {
      tries++;
      await new Promise(r => setTimeout(r, 2000));
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

    // Mask SEMUA URL: download + thumbnail + profilePic
    const mediaList = await Promise.all(items.map(async (m, i) => {
      const code = makeCode();
      const route = m.type === 'image' ? 'resimg' : 'resvid';
      const kind = m.type === 'video' ? 'vid' : m.type === 'audio' ? 'aud' : 'img';
      const ext = kind === 'vid' ? 'mp4' : kind === 'aud' ? 'mp3' : 'jpg';

      const [shortUrl, shortThumb] = await Promise.all([
        storeLink(route + ':' + code, m.downloadUrl, kind)
          .then(ok => ok ? 'https://jhx.my.id/' + route + '/' + code : m.downloadUrl),
        registerLink('resimg', m.thumbnail, 'img')
      ]);

      return {
        type: m.type,
        thumbnail: shortThumb,
        url: shortUrl,
        filename: 'JHIG_' + kind + '_' + code + '.' + ext,
        size: sizes[i],
        sizeHuman: sizes[i] > 0
          ? (sizes[i] > 1048576 ? (sizes[i] / 1048576).toFixed(2) + ' MB' : (sizes[i] / 1024).toFixed(1) + ' KB')
          : null
      };
    }));

    const resultData = {
      username: $('#profile_grid .text-400-16-18').first().text().trim(),
      profilePic: await registerLink('resimg', rawProfilePic, 'img'),
      media: mediaList
    };

    return res.status(200).json(formatRes(true, resultData));
  } catch (e) {
    return res.status(500).json(formatRes(false, e.response?.data || e.message));
  }
};
