import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Home from './pages/Home.jsx'
import Projects from './pages/Projects.jsx'
import Studio from './pages/Studio.jsx'
const FrameStudio = lazy(() => import('./pages/FrameStudio.jsx'))
const CommandCenter = lazy(() => import('./pages/CommandCenter.jsx'))
const VariasiGaleri = lazy(() => import('./pages/VariasiGaleri.jsx'))
const NaskahHoror = lazy(() => import('./pages/NaskahHoror.jsx'))
const PromptFlow = lazy(() => import('./pages/PromptFlow.jsx'))
import SettingsModal from './components/SettingsModal.jsx'

// Logo: tanda potong kuning mengapit kotak 9:16 (motif crop marks, lihat DESIGN.md)
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="6" height="12" rx="1" fill="currentColor" />
      <path d="M1 5V1h4M13 1h4v4M17 13v4h-4M5 17H1v-4" stroke="#FFD100" strokeWidth="2" />
    </svg>
  )
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api('/api/health').then(setHealth).catch(() => setHealth({ ok: false }))
  }, [])

  return (
    <BrowserRouter>
      <nav className="nav">
        <Link to="/" className="brand"><BrandMark />Studio Clip</Link>
        <div className="nav-links">
          <NavLink to="/" end>Buat Klip</NavLink>
          <NavLink to="/frame-studio">Frame Studio</NavLink>
          <NavLink to="/projects">Riwayat</NavLink>
          <NavLink to="/variasi">Galeri variasi</NavLink>
          <NavLink to="/naskah-horor">Naskah horor</NavLink>
          <NavLink to="/prompt-flow">Prompt Flow</NavLink>
          <NavLink to="/command-center">Command Center</NavLink>
        </div>
        <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)} aria-label="Pengaturan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
          </svg>
          <span className="nav-settings-label">Pengaturan</span>
        </button>
      </nav>

      {health && health.ok === false && (
        <div className="banner banner-danger" role="alert">
          Backend tidak terjangkau. Jalankan dulu <code>start-all.bat</code> atau <code>backend\run.bat</code>, lalu muat ulang halaman ini.
        </div>
      )}
      {health?.ok && !health.ffmpeg && (
        <div className="banner banner-warn" role="alert">
          ffmpeg tidak ditemukan di PATH, jadi export video tidak akan jalan. Install dengan{' '}
          <code>winget install Gyan.FFmpeg</code>, buka ulang terminal, lalu restart backend.
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/studio/:id" element={<Studio />} />
        <Route path="/frame-studio" element={<Suspense fallback={<p className="page hint">Memuat Frame Studio…</p>}><FrameStudio /></Suspense>} />
        <Route path="/variasi" element={<Suspense fallback={<p className="page hint">Memuat galeri…</p>}><VariasiGaleri /></Suspense>} />
        <Route path="/naskah-horor" element={<Suspense fallback={<p className="page hint">Memuat naskah…</p>}><NaskahHoror /></Suspense>} />
        <Route path="/prompt-flow" element={<Suspense fallback={<p className="page hint">Memuat Prompt Flow…</p>}><PromptFlow /></Suspense>} />
        <Route path="/command-center"element={<Suspense fallback={<p className="page hint">Memuat Command Center…</p>}><CommandCenter /></Suspense>} />
      </Routes>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </BrowserRouter>
  )
}
