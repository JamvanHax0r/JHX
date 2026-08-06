module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    service: 'JH-Tools API',
    status: 'operational',
    uptime: process.uptime(),
    region: 'sin1',
    version: '2.0.0'
  });
};
