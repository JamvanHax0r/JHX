const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = String(req.query.code || 'XXXX').slice(0, 8);
  const b64 = req.query.url;
  if (!b64) return res.status(400).send('Missing url parameter');

  let originalUrl;
  try {
    // reverse base64url
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    originalUrl = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
  } catch { return res.status(400).send('Invalid url encoding'); }

  try {
    const upstream = await axios.get(originalUrl, {
      responseType: 'stream',
      timeout: 45000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': '*/*'
      }
    });

    // Forward size biar ga 0 byte
    const ctype = upstream.headers['content-type'] || 'image/jpeg';
    const clen = upstream.headers['content-length'];
    res.setHeader('Content-Type', ctype);
    if (clen) res.setHeader('Content-Length', clen);
    res.setHeader('Content-Disposition', `attachment; filename="JHIG_img_${code}.jpg"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');

    upstream.data.pipe(res);
  } catch (e) {
    res.status(500).send('Proxy failed: ' + (e.message || 'unknown'));
  }
};
