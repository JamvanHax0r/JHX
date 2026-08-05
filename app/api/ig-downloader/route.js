// app/api/ig-downloader/route.js
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function POST(req) {
  try {
    const { url } = await req.json();
    
    if (!url || !url.includes('instagram.com')) {
      return Response.json({ Status: false, error: "URL Instagram tidak valid!" }, { status: 400 });
    }

    const formatRes = (status, data) => ({
      Skrep_by: "JH a.k.a Dhika",
      Kesayangan: "Fiony Alveria♡",
      Status: status,
      ...(status ? { data } : { error: data })
    });

    const jantung = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'HX-Request': 'true',
      'HX-Trigger': 'main-form',
      'HX-Target': 'target',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Ambil parameter tt dan ts
    const initRes = await axios.get('https://reelsvideo.io/id-4', { 
      headers: { 'User-Agent': jantung['User-Agent'] } 
    });
    const $init = cheerio.load(initRes.data);
    const tt = $init('#tt').val();
    const ts = $init('#ts').val();

    if (!tt || !ts) throw new Error('Gagal mengambil parameter tt dan ts');

    // 2. Solve Turnstile via API lo
    const { data: { jobId } } = await axios.post('https://cap.jhx.my.id/api/createTask', {
      url: 'https://reelsvideo.io/id-4',
      type: 'turnstile-min',
      sitekey: '0x4AAAAAACVCPoioqL3q_FXF'
    });

    let token;
    while (!token) {
      await new Promise(r => setTimeout(r, 3000));
      const { data } = await axios.post('https://cap.jhx.my.id/api/getResult', { jobId });
      if (data.status === 'ready') token = data.solution.token;
      if (data.status === 'failed') throw new Error('Captcha Solver failed');
    }

    // 3. Submit request ke target
    const payload = new URLSearchParams({
      id: url, // <-- URL DINAMIS DARI USER
      locale: 'id',
      tt,
      ts,
      'cf-turnstile-response': token
    });

    const res = await axios.post('https://reelsvideo.io/id-4', payload, { headers: jantung });
    const $ = cheerio.load(res.data);
    
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
      
      if (downloadUrl) {
        resultData.media.push({ type, thumbnail, downloadUrl });
      }
    });

    return Response.json(formatRes(true, resultData));

  } catch (e) {
    const detail = e.response?.data || e.message;
    return Response.json(formatRes(false, detail), { status: 500 });
  }
}
