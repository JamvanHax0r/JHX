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
      if (!data.Status) throw new Error(data.error || 'Gagal mengambil data');
      setResult(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030014] text-slate-200">
      <nav className="fixed w-full z-50 top-0 bg-[#030014]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="https://jhax0r.my.id/logo.jpeg" alt="Logo" className="h-10 w-10 rounded-xl border border-purple-500/40" />
            <span className="font-bold text-xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">JH-TOOLS</span>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-16 text-center px-4">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]">
          JH-TOOLS
        </h1>
        <p className="text-slate-400 mb-8 text-lg">Next-generation digital arsenal.</p>
        
        <div className="max-w-2xl mx-auto bg-white/5 border border-pink-500/30 rounded-2xl p-6 backdrop-blur-xl">
          <div className="flex flex-col md:flex-row gap-4">
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/..." 
              className="flex-1 bg-black/50 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-pink-400"
            />
            <button 
              onClick={handleDownload}
              disabled={loading}
              className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold px-6 py-3 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'DOWNLOAD'}
            </button>
          </div>
          
          {error && <p className="text-red-400 mt-4 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/30">⚠️ {error}</p>}
          
          {result && (
            <div className="mt-6 text-left border-t border-white/10 pt-4">
              <div className="flex items-center gap-3 mb-4">
                <img src={result.profilePic} alt="Profile" className="w-12 h-12 rounded-full border-2 border-cyan-400" />
                <p className="text-cyan-400 font-bold text-lg">@{result.username}</p>
              </div>
              <div className="grid gap-3">
                {result.media.map((item, i) => (
                  <a key={i} href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-white/10 hover:bg-purple-500/20 border border-purple-500/40 text-white font-bold py-3 rounded-lg transition-all">
                    ⬇️ DOWNLOAD {item.type.toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-purple-500/20 py-8 text-center bg-black/40 mt-12">
        <p className="text-slate-400">Made with <span className="text-pink-400">❤</span> by <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 font-bold">JamvanHax0r</span></p>
        <p className="text-slate-500 text-xs mt-2">© {new Date().getFullYear()} — All Rights Reserved</p>
      </footer>
    </div>
  );
}
