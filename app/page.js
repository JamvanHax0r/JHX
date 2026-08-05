export const metadata = {
  title: 'JH-Tools | Next-Gen Digital Platform',
  description: 'Platform tools tercanggih: Captcha Solver, Downloader, Music Tools, & AI.',
  icons: {
    icon: 'https://jhax0r.my.id/logo.jpeg',
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030014] text-slate-200">
      {/* Navbar */}
      <nav className="fixed w-full z-50 top-0 bg-[#030014]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-3">
              <img src="https://jhax0r.my.id/logo.jpeg" alt="Logo" className="h-9 w-9 md:h-10 md:w-10 rounded-xl" />
              <span className="font-bold text-xl md:text-2xl text-cyan-400">JH-TOOLS</span>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <a href="#home" className="text-sm text-slate-300 hover:text-cyan-400">Home</a>
              <a href="#features" className="text-sm text-slate-300 hover:text-cyan-400">Features</a>
              <a href="#downloader" className="text-sm text-slate-300 hover:text-cyan-400">Downloader</a>
              <a href="#contact" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold px-6 py-2.5 rounded-full">Get Started</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="relative min-h-screen flex items-center justify-center pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-sm font-medium text-cyan-400">SYSTEM ONLINE v2.0</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            JH-TOOLS
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Next-generation digital arsenal. Dari <span className="text-cyan-400 font-semibold">Captcha Solver</span>, <span className="text-purple-400 font-semibold">Downloader</span>, hingga <span className="text-pink-400 font-semibold">AI Assistant</span>.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#downloader" className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold rounded-full hover:scale-105 transition-transform">
              INITIATE SEQUENCE
            </a>
            <a href="https://github.com/JamvanHax0r/JHX" target="_blank" className="px-8 py-4 border border-purple-500/50 text-purple-400 font-bold rounded-full hover:bg-purple-500/10">
              SOURCE CODE
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 text-white">
            SYSTEM <span className="text-cyan-400">MODULES</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['Captcha Solver', 'Universal Downloader', 'Music Tools', 'AI Assistant', 'Privacy First', 'Dev Mode'].map((feature, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-purple-500/40 transition-all">
                <h3 className="text-xl font-bold text-white mb-3">{feature}</h3>
                <p className="text-slate-400 text-sm">Fitur premium untuk kebutuhan digital lo.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IG Downloader Section */}
      <section id="downloader" className="py-20 md:py-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 text-white">
            INSTAGRAM <span className="text-pink-400">DOWNLOADER</span>
          </h2>
          <div className="bg-white/5 backdrop-blur-xl border border-pink-500/30 rounded-2xl p-8">
            <div className="flex flex-col md:flex-row gap-4">
              <input 
                type="text" 
                id="igUrlInput" 
                placeholder="https://www.instagram.com/p/..." 
                className="flex-1 bg-black/50 border border-purple-500/30 rounded-xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-pink-400"
              />
              <button 
                onClick={downloadIG} 
                id="downloadBtn"
                className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-105 transition-transform"
              >
                DOWNLOAD
              </button>
            </div>
            <div id="resultContainer" className="hidden mt-8"></div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-purple-500/20 py-12 text-center">
        <p className="text-slate-400">
          Made with <span className="text-pink-400">❤</span> by <span className="bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent font-bold">JamvanHax0r</span>
        </p>
        <p className="text-slate-400 mt-2">
          Supported by: <span className="text-cyan-400">BCCTeam</span> - <span className="text-purple-400">FLMGroup</span> - <span className="text-pink-400">Fiony Bot</span>
        </p>
        <p className="text-slate-500 text-xs mt-4">© {new Date().getFullYear()} — All Rights Reserved</p>
      </footer>
    </div>
  );
}

async function downloadIG() {
  const url = document.getElementById('igUrlInput').value;
  const res = await fetch('/api/ig-downloader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await res.json();
  console.log(data);
}
