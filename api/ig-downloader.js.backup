const axios = require('axios');
const cheerio = require('cheerio');

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
      'HX-Request': 'true',
      'HX-Trigger': 'main-form',
      'HX-Target': 'target',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const initRes = await axios.get('https://reelsvideo.io/id-4', { headers: { 'User-Agent': jantung['User-Agent'] } });
    const $init = cheerio.load(initRes.data);
    const tt = $init('#tt').val();
    const ts = $init('#ts').val();
    if (!tt || !ts) throw new Error('Gagal mengambil parameter tt dan ts');

    const { data: { jobId } } = await axios.post('https://cap.jhx.my.id/api/createTask', {
      url: 'https://reelsvideo.io/id-4',
      type: 'turnstile-min',
      sitekey: '0x4AAAAAACVCPoioqL3q_FXF'
    });

    let token;
    let tries = 0;
    while (!token && tries < 25) {
      tries++;
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await axios.post('https://cap.jhx.my.id/api/getResult', { jobId });
      if (data.status === 'ready') token = data.solution.token;
      if (data.status === 'failed') throw new Error('Solver gagal menyelesaikan challenge');
    }
    if (!token) throw new Error('Solver timeout');

    const payload = new URLSearchParams({ id: url, locale: 'id', tt, ts, 'cf-turnstile-response': token });
    const resp = await axios.post('https://reelsvideo.io/id-4', payload, { headers: jantung });
    const $ = cheerio.load(resp.data);

    const resultData = {
      username: $('#profile_grid .text-400-16-18').first().text().trim(),
      profilePic: $('#profile_grid img.rounded-full').first().attr('src'),
      media: []
    };

    $('#profile_grid .bg-white.relative.rounded-3xl').each((_, el) => {
      let type = 'unknown';
      if ($(el).find('.type_videos').length) type = 'video';
      else if ($(el).find('.type_images').length) type = 'image';
      else if ($(el).find('.type_audio').length) type = 'audio';
      const thumbnail = $(el).find('[data-bg]').attr('data-bg');
      const downloadUrl = $(el).find('a.download_link, a.mp3').attr('href');
      if (downloadUrl) resultData.media.push({ type, thumbnail, downloadUrl });
    });

    return res.status(200).json(formatRes(true, resultData));
  } catch (e) {
    return res.status(500).json(formatRes(false, e.response?.data || e.message));
  }
};
