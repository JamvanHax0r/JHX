'use client';

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    if (!url || !url.includes('instagram.com')) {
      setError('Masukkan URL Instagram yang valid!');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/ig-downloader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const data = await res.json();

      if (!data.Status) {
        throw new Error(data.error || 'Gagal mengambil data');
      }

      setResult(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030014] text-slate-200 font-sans">
      {/* Navbar */}
      <nav className="fixed w-full z-50 top-0 bg-[#030014]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-3">
              <img src="https://jhax0r.my.id/logo.jpeg" alt="Logo" className="h-9 w-9 md:h-10 md:w-10 rounded-xl border border-purple-500/40" />
              <span className="font-bold text-xl md:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">JH-TOOLS</span>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <a href="#home" className="text-sm text-slate-300 hover:text-cyan-400 transition-colors">Home</a>
              <a href="#features" className="text-sm text-slate-300 hover:text-cyan-400 transition-colors">Features</a>
              <a href="#downloader" className="text-sm text-slate-300 hover:text-cyan-400 transition-colors">Downloader</a>
              <a href="#contact" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold px-6 py-2.5 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">Get Started</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="relative min-h-screen flex items-center justify-center pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 mb-8 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-sm font-medium text-cyan-400">SYSTEM ONLINE v2.0</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]">
            JH-TOOLS
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Next-generation digital arsenal. Dari <span className="text-cyan-400 font-semibold">Captcha Solver</span>, <span className="text-purple-400 font-semibold">Downloader</span>, hingga <span className="text-pink-400 font-semibold">AI Assistant</span>.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#downloader" className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold rounded-full hover:scale-105 transition-transform shadow-[0_0_25px_rgba(6,182,212,0.4)]">
              INITIATE SEQUENCE
            </a>
            <a href="https://github.com/JamvanHax0r/JHX" target="_blank" className="px-8 py-4 border border-purple-500/50 text-purple-400 font-bold rounded-full hover:bg-purple-500/10 transition-all">
              SOURCE CODE
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 text-white">
            SYSTEM <span className="text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">MODULES</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['Captcha Solver', 'Universal Downloader', 'Music Tools', 'AI Assistant', 'Privacy First', 'Dev Mode'].map((feature, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-purple-500/40 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] transition-all cursor-pointer group">
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-cyan-400 transition-colors">{feature}</h3>
                <p className="text-slate-400 text-sm">Fitur premium untuk kebutuhan digital lo, dirancang untuk kecepatan dan keamanan maksimal.</p>
                </div>
            ))}
          </div>
        </div>
      </section>

      {/* IG Downloader Section */}
      <section id="downloader" className="py-20 md:py-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 text-white">
            INSTAGRAM <span className="text-pink-400 drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]">DOWNLOADER</span>
          </h2>
          <div className="bg-white/5 backdrop-blur-xl border border-pink-500/30 rounded-2xl p-8 shadow-[0_0_30px_rgba(236,72,153,0.1)]">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/p/..." 
                className="flex-1 bg-black/50 border border-purple-500/30 rounded-xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-all"
              />
              <button 
                onClick={handleDownload}
                disabled={loading}
                className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[160px]"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    PROCESSING...
                  </>
                ) : (
                  'DOWNLOAD'
                )}
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center mb-4">
                ⚠️ {error}
              </div>
            )}

            {result && (
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="flex items-center gap-4 mb-6">
                  <img src={result.profilePic} alt="Profile" className="w-16 h-16 rounded-full border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
                  <div>
                    <h3 className="font-bold text-xl text-white">@{result.username}</h3>
                    <p className="text-cyan-400 text-sm">Media berhasil ditemukan</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.media.map((item, index) => (
                    <div key={index} className={`bg-white/5 backdrop-blur-xl border rounded-xl p-4 flex flex-col gap-3 border-l-4 ${item.type === 'video' ? 'border-l-pink-500' : 'border-l-cyan-400'}`}>
                      <div className="flex items-center gap-2 text-sm text-slate-300 font-bold uppercase tracking-wider">
                        {item.type === 'video' ? '🎥' : '🖼️'} Media {index + 1} ({item.type})
                      </div>
                      <a 
                        href={item.downloadUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full text-center bg-white/5 hover:bg-purple-500/20 border border-purple-500/40 text-white font-bold py-3 rounded-lg transition-all duration-300 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center justify-center gap-2"
                      >
                        ⬇️ DOWNLOAD {item.type.toUpperCase()}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="border-t border-purple-500/20 py-12 text-center bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="https://jhax0r.my.id/logo.jpeg" alt="Logo" className="h-8 w-8 rounded-lg border border-cyan-400/30" />
            <span className="font-bold text-xl text-white tracking-widest">JH-TOOLS</span>
          </div>
          <p className="text-slate-400 mb-2">
            Made with <span className="text-pink-400 inline-block animate-pulse">❤</span> by <span className="bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent font-bold text-lg">JamvanHax0r</span>
          </p>
          <p className="text-slate-400 mb-4">
            Supported by: <span className="text-cyan-400 font-semibold">BCCTeam</span> - <span className="text-purple-400 font-semibold">FLMGroup</span> - <span className="text-pink-400 font-semibold">Fiony Bot</span>
          </p>
          <p className="text-slate-500 text-xs mt-6">© {new Date().getFullYear()} — All Rights Reserved</p>
        </div>
      </footer>
    </div>
  );
}
