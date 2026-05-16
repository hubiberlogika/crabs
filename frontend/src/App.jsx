import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const DROPDOWN_OPTIONS = {
  floors:      ['1 Lantai', '2 Lantai', '3 Lantai', '4+ Lantai'],
  certificate: ['SHM', 'SHGB', 'PPJB', 'AJB', 'HGB'],
  electricity: ['450 VA', '900 VA', '1300 VA', '2200 VA', '3500 VA', '4400 VA', '6600 VA'],
  water:       ['PAM', 'Pompa', 'Sumur', 'PDAM', 'Air Tanah'],
};

function App() {
  const [activeTab, setActiveTab] = useState('target');
  const [viewMode, setViewMode] = useState('table');
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  const [targetUsername, setTargetUsername] = useState('');
  const [viewerUsername, setViewerUsername] = useState(localStorage.getItem('ig_viewer_user') || '');
  const [viewerPassword, setViewerPassword] = useState(localStorage.getItem('ig_viewer_pass') || '');
  const [sessionId, setSessionId] = useState(localStorage.getItem('ig_session_id') || '');

  const handleSessionChange = (v) => { setSessionId(v); localStorage.setItem('ig_session_id', v); };
  const handleUserChange   = (v) => { setViewerUsername(v); localStorage.setItem('ig_viewer_user', v); };
  const handlePassChange   = (v) => { setViewerPassword(v); localStorage.setItem('ig_viewer_pass', v); };

  const [scrapeLimit, setScrapeLimit] = useState(10);
  const [agentFilter, setAgentFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // IG Poster settings (saved to localStorage)
  const [posterSession, setPosterSession]   = useState(localStorage.getItem('ig_poster_session') || '');
  const [posterUser, setPosterUser]         = useState(localStorage.getItem('ig_poster_user') || '');
  const [posterPass, setPosterPass]         = useState(localStorage.getItem('ig_poster_pass') || '');
  const [dailyLimit, setDailyLimit]         = useState(parseInt(localStorage.getItem('ig_daily_limit')) || 3);
  const [todayCount, setTodayCount]         = useState(0);
  const [postingId, setPostingId]           = useState(null); // which prop is being posted

  const savePosterSession = (v) => { setPosterSession(v); localStorage.setItem('ig_poster_session', v); };
  const savePosterUser    = (v) => { setPosterUser(v);    localStorage.setItem('ig_poster_user', v); };
  const savePosterPass    = (v) => { setPosterPass(v);    localStorage.setItem('ig_poster_pass', v); };
  const saveDailyLimit    = (v) => { setDailyLimit(v);    localStorage.setItem('ig_daily_limit', v); };

  const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  useEffect(() => {
    if (activeTab === 'hasil' || activeTab === 'listing') fetchProperties();
    if (activeTab === 'listing') fetchTodayCount();
  }, [activeTab]);

  const fetchTodayCount = async () => {
    try {
      const res  = await fetch(`${API_URL}/api/ig/post-status`);
      const data = await res.json();
      setTodayCount(data.today_count || 0);
    } catch {}
  };

  const handlePostToIG = async (prop, e) => {
    e.stopPropagation();
    if (!prop.photos?.length) { alert('Tambahkan minimal 1 foto sebelum posting ke IG!'); return; }
    if (!window.confirm(`Post "${prop.price || 'properti ini'}" ke Instagram?`)) return;
    setPostingId(prop.id);
    try {
      const res  = await fetch(`${API_URL}/api/ig/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prop_id: prop.id,
          session_id: posterSession,
          poster_username: posterUser,
          poster_password: posterPass,
          daily_limit: dailyLimit,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}\n${data.ig_url}`);
        fetchTodayCount();
        setProperties(prev => prev.map(p => p.id === prop.id ? { ...p, ig_posted_at: new Date().toISOString() } : p));
      } else {
        alert(`❌ Gagal: ${data.detail}`);
      }
    } catch { alert('Gagal menghubungi server.'); }
    finally { setPostingId(null); }
  };

  const fetchProperties = async () => {
    try {
      const res  = await fetch(`${API_URL}/api/properties`);
      const data = await res.json();
      if (data.data) setProperties(data.data);
    } catch (err) { console.error('Fetch error:', err); }
  };

  const handleScrape = async () => {
    if (!targetUsername) { setStatusMsg('Mohon isi Target Username!'); return; }
    setLoading(true);
    setStatusMsg('Sedang memulai proses… (2-5 detik per post untuk menghindari blokir IG)');
    try {
      const res  = await fetch(`${API_URL}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_username: targetUsername,
          viewer_username: viewerUsername,
          viewer_password: viewerPassword,
          session_id: sessionId,
          limit: Math.min(parseInt(scrapeLimit) || 10, 20),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(data.message || 'Scraping selesai.');
        setTimeout(() => { fetchProperties(); setActiveTab('hasil'); setStatusMsg(''); }, 1500);
      } else {
        setStatusMsg('Gagal: ' + (data.detail || 'Terjadi kesalahan server.'));
      }
    } catch { setStatusMsg('Gagal menghubungi server. Mungkin timeout.'); }
    finally   { setLoading(false); }
  };

  const handleSaveProp = async (updatedProp) => {
    try {
      if (updatedProp.id) {
        await fetch(`${API_URL}/api/properties/${updatedProp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedProp),
        });
        setProperties(properties.map(p => p.id === updatedProp.id ? updatedProp : p));
      } else {
        const res    = await fetch(`${API_URL}/api/properties/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedProp),
        });
        const result = await res.json();
        if (result.data) setProperties([result.data, ...properties]);
      }
      setSelectedProp(null);
    } catch { alert('Gagal menyimpan data!'); }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Yakin hapus SEMUA data scraping? Data listing manual tetap aman.')) return;
    try {
      const res = await fetch(`${API_URL}/api/properties`, { method: 'DELETE' });
      if (res.ok) setProperties(properties.filter(p => p.is_manual));
    } catch (err) { console.error(err); }
  };

  const scrapedList  = properties.filter(p => !p.is_manual);
  const manualList   = properties.filter(p => p.is_manual);
  const activeList   = activeTab === 'listing' ? manualList : scrapedList;

  const filtered = activeList.filter(prop => {
    if (!agentFilter) return true;
    const name = prop.agent_name?.split('(')[0].trim() || '';
    return name.toLowerCase().includes(agentFilter.toLowerCase());
  });

  const TABLE_COLS = [
    { key: 'price', label: 'Harga' },
    { key: 'land_area', label: 'LT' },
    { key: 'building_area', label: 'LB' },
    { key: 'bedrooms', label: 'KT' },
    { key: 'bathrooms', label: 'KM' },
    { key: 'floors', label: 'Lantai' },
    { key: 'agent_name', label: 'Agen' },
    { key: 'facilities', label: 'Fasilitas' },
    { key: 'carport', label: 'Carport' },
    { key: 'electricity', label: 'Listrik' },
    { key: 'water', label: 'Air' },
    { key: 'certificate', label: 'Surat' },
  ];

  return (
    <div className="app-container">
      <header className="header">
        <h1>IG Real Estate</h1>
        {showInstall && (
          <button onClick={handleInstall} style={{
            marginTop: 6, padding: '6px 14px', borderRadius: 20,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
          }}>
            📲 Install Aplikasi
          </button>
        )}
      </header>

      <div className="tabs">
        {['target','hasil','listing'].map(t => (
          <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
            {t==='target' ? 'Target IG' : t==='hasil' ? 'Hasil Scraping' : 'Listing Property'}
          </button>
        ))}
      </div>

      <main className="content">
        {activeTab === 'target' ? (
          <div className="form-wrapper">
            <div className="glass" style={{ padding: '20px' }}>
              <div style={{ background:'rgba(14,165,233,0.1)', border:'1px solid var(--accent)', borderRadius:12, padding:16, marginBottom:20 }}>
                <h3 style={{ fontSize:'1.1rem', marginBottom:8, color:'var(--text-main)' }}>🎯 1. Target IG</h3>
                <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:15 }}>Akun Instagram yang datanya akan ditarik.</p>
                <div className="form-group">
                  <label>Username IG Target</label>
                  <input type="text" className="form-input" placeholder="Contoh: @rumah.idaman"
                    value={targetUsername} onChange={e => setTargetUsername(e.target.value)}
                    style={{ background:'rgba(0,0,0,0.3)', borderColor:'var(--accent)' }} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Jumlah Data (Maks. 20/sesi — anti-blokir)</label>
                  <input type="number" className="form-input" min="1" max="20"
                    value={scrapeLimit} onChange={e => setScrapeLimit(e.target.value)} />
                </div>
                <p style={{ fontSize:'0.75rem', color:'#f59e0b', marginTop:8 }}>
                  ⚠️ Setiap post diberi jeda 2-5 detik otomatis agar tidak kena blokir Instagram.
                </p>
              </div>

              <details style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--glass-border)', borderRadius:12, padding:16, marginBottom:24, cursor:'pointer' }}>
                <summary style={{ fontSize:'1.1rem', color:'var(--text-main)', outline:'none' }}>⚙️ 2. Pengaturan Bot</summary>
                <div style={{ marginTop:15 }} onClick={e => e.stopPropagation()}>
                  <div className="form-group" style={{ background:'rgba(16,185,129,0.1)', padding:10, borderRadius:8, border:'1px dashed #10b981' }}>
                    <label>IG Session ID (Cookie — Paling Aman!)</label>
                    <input type="text" className="form-input" placeholder="Contoh: 51928374%3Ax8k..."
                      value={sessionId} onChange={e => handleSessionChange(e.target.value)} />
                  </div>
                  <div style={{ textAlign:'center', margin:'15px 0', fontSize:'0.8rem', color:'var(--text-muted)' }}>ATAU</div>
                  <div className="form-group">
                    <label>Username Viewer</label>
                    <input type="text" className="form-input" placeholder="bot_viewer_1"
                      value={viewerUsername} onChange={e => handleUserChange(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Password Viewer</label>
                    <input type="password" className="form-input" placeholder="••••••••"
                      value={viewerPassword} onChange={e => handlePassChange(e.target.value)} />
                  </div>
                </div>
              </details>

              <button className="btn-primary" onClick={handleScrape} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Memproses…' : 'Mulai Scraping'}
              </button>
              {statusMsg && <p style={{ marginTop:15, textAlign:'center', color:'var(--accent)', fontSize:'0.85rem' }}>{statusMsg}</p>}
            </div>
          </div>

        ) : (
          <div>
            {/* Toolbar */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', marginBottom:15, gap:10 }}>
              <div className="filters-scroll" style={{ marginBottom:0, paddingBottom:0, display:'flex', gap:10, alignItems:'center' }}>
                <div className="filter-pill" onClick={fetchProperties} style={{ cursor:'pointer' }}>🔄 Refresh</div>

                {activeTab === 'listing' && (
                  <div className="filter-pill" onClick={() => setSelectedProp({})}
                    style={{ cursor:'pointer', background:'rgba(16,185,129,0.2)', color:'#10b981', border:'1px solid #10b981' }}>
                    ➕ Tambah Manual
                  </div>
                )}
                {activeTab === 'hasil' && (
                  <div className="filter-pill" onClick={handleDeleteAll}
                    style={{ cursor:'pointer', background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.5)' }}>
                    🗑️ Hapus Scraping
                  </div>
                )}
                {activeTab === 'listing' && (
                  <span style={{ fontSize:'0.8rem', color: todayCount >= dailyLimit ? '#ef4444' : '#10b981', fontWeight:600, whiteSpace:'nowrap' }}>
                    📤 {todayCount}/{dailyLimit} post hari ini
                  </span>
                )}
              </div>

              {activeTab === 'listing' && (
                <details style={{ width:'100%', marginBottom:10, background:'rgba(225,48,108,0.05)', border:'1px solid rgba(225,48,108,0.3)', borderRadius:12, padding:'10px 14px', cursor:'pointer' }}>
                  <summary style={{ color:'#e1306c', fontWeight:600, fontSize:'0.9rem', outline:'none' }}>
                    ⚙️ Pengaturan Posting IG
                  </summary>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }} onClick={e => e.stopPropagation()}>
                    <div className="form-group" style={{ gridColumn:'1/-1' }}>
                      <label>Session ID Akun Poster (disarankan)</label>
                      <input type="text" className="form-input" placeholder="sessionid dari cookies instagram.com"
                        value={posterSession} onChange={e => savePosterSession(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Username Poster</label>
                      <input type="text" className="form-input" placeholder="akun_poster_ig"
                        value={posterUser} onChange={e => savePosterUser(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Password Poster</label>
                      <input type="password" className="form-input" placeholder="••••••••"
                        value={posterPass} onChange={e => savePosterPass(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ gridColumn:'1/-1', marginBottom:0 }}>
                      <label>Batas Posting Per Hari</label>
                      <select className="form-input" value={dailyLimit} onChange={e => saveDailyLimit(parseInt(e.target.value))}>
                        {[1,2,3,5,10].map(n => <option key={n} value={n}>{n} post/hari</option>)}
                      </select>
                    </div>
                  </div>
                </details>
              )}

                <select className="filter-pill"
                  style={{ background:'transparent', border:'1px solid var(--glass-border)', color:'var(--text-main)', outline:'none' }}
                  value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                  <option value="" style={{ color:'black' }}>👤 Semua Agen</option>
                  {[...new Set(activeList.map(p => p.agent_name?.split('(')[0].trim()).filter(n => n && n.length > 2))].map(n => (
                    <option key={n} value={n} style={{ color:'black' }}>{n}</option>
                  ))}
                </select>
              </div>

              {activeTab === 'hasil' && (
                <div className="view-toggle" style={{ marginBottom:0 }}>
                  <button className={`toggle-btn ${viewMode==='table'?'active':''}`} onClick={() => setViewMode('table')}>Tabel</button>
                  <button className={`toggle-btn ${viewMode==='card'?'active':''}`} onClick={() => setViewMode('card')}>Cards</button>
                </div>
              )}
            </div>

            {/* Table view — always for listing, togglable for hasil */}
            {(viewMode === 'table' || activeTab === 'listing') ? (
              <div className="table-container glass">
                <table>
                  <thead>
                    <tr>
                      {TABLE_COLS.map(c => <th key={c.key}>{c.label}</th>)}
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(prop => (
                      <tr key={prop.id} onClick={() => setSelectedProp(prop)} className="hover-row" style={{ cursor:'pointer' }}>
                        {TABLE_COLS.map(c => <td key={c.key}>{prop[c.key] || '-'}</td>)}
                        <td onClick={e => e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                          {prop.ig_post_url
                            ? <a href={prop.ig_post_url} target="_blank" rel="noreferrer" className="action-link" style={{marginRight:6}}>IG</a>
                            : null}
                          {activeTab === 'listing' && (
                            <button
                              onClick={e => handlePostToIG(prop, e)}
                              disabled={postingId === prop.id || todayCount >= dailyLimit}
                              title={todayCount >= dailyLimit ? 'Batas posting harian tercapai' : 'Post ke Instagram'}
                              style={{
                                background: prop.ig_posted_at ? 'rgba(16,185,129,0.15)' : 'rgba(225,48,108,0.15)',
                                color: prop.ig_posted_at ? '#10b981' : '#e1306c',
                                border: `1px solid ${prop.ig_posted_at ? '#10b981' : '#e1306c'}`,
                                borderRadius: 8, padding: '3px 8px', fontSize: '0.75rem',
                                cursor: (postingId === prop.id || todayCount >= dailyLimit) ? 'not-allowed' : 'pointer',
                                opacity: postingId === prop.id ? 0.6 : 1,
                              }}
                            >
                              {postingId === prop.id ? '⏳' : prop.ig_posted_at ? '✅ Posted' : '📤 Post'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan="13" style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Belum ada data.</td></tr>
                    )}
                  </tbody>
                </table>
                <p style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--text-muted)', padding:'10px 0' }}>
                  Klik baris untuk detail &amp; edit.
                </p>
              </div>
            ) : (
              <div className="cards-grid">
                {filtered.map(prop => (
                  <div key={prop.id} className="property-card glass" onClick={() => setSelectedProp(prop)} style={{ cursor:'pointer' }}>
                    {prop.photos?.length > 0 && (
                      <img src={prop.photos[0]} alt="foto properti"
                        style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:8, marginBottom:10 }} />
                    )}
                    <div className="card-header">
                      <div className="card-price">{prop.price || 'Harga -'}</div>
                      {prop.ig_post_url && <a href={prop.ig_post_url} target="_blank" rel="noreferrer" className="action-link" onClick={e => e.stopPropagation()}>IG</a>}
                    </div>
                    <div className="card-agent">👤 {prop.agent_name || 'Tidak diketahui'}</div>
                    <div className="card-grid-details">
                      <div className="card-detail-item"><strong>LT/LB</strong>{prop.land_area||'-'}/{prop.building_area||'-'}</div>
                      <div className="card-detail-item"><strong>KT/KM</strong>{prop.bedrooms||'-'}/{prop.bathrooms||'-'}</div>
                      <div className="card-detail-item"><strong>Lantai</strong>{prop.floors||'-'}</div>
                      <div className="card-detail-item"><strong>Surat</strong>{prop.certificate||'-'}</div>
                    </div>
                    <div className="card-footer">
                      <span>{new Date(prop.scraped_at).toLocaleDateString('id-ID')}</span>
                      <span style={{ color:'var(--accent)' }}>🔍 Detail</span>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', gridColumn:'1/-1' }}>Belum ada data.</div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {selectedProp !== null && (
        <PropertyModal
          prop={selectedProp}
          apiUrl={API_URL}
          onClose={() => setSelectedProp(null)}
          onSave={handleSaveProp}
        />
      )}
    </div>
  );
}

/* ─── Property Modal ─────────────────────────────────────── */
function PropertyModal({ prop, apiUrl, onClose, onSave }) {
  const isNew = !prop.id;
  const [isEditing, setIsEditing] = useState(isNew);
  const [formData, setFormData] = useState(prop);
  const [photos, setPhotos]     = useState(prop.photos || []);
  const fileRef = useRef();

  const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files).slice(0, 8 - photos.length);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setPhotos(prev => prev.length < 8 ? [...prev, ev.target.result] : prev);
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx) => setPhotos(p => p.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const payload = { ...formData, photos };
    // If existing property, also save photos separately
    if (formData.id && photos !== prop.photos) {
      try {
        await fetch(`${apiUrl}/api/properties/${formData.id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photos }),
        });
      } catch {}
    }
    onSave({ ...payload, photos });
  };

  const TEXT_FIELDS = [
    { key:'price',         label:'Harga',             half:true },
    { key:'agent_name',    label:'Nama & Kontak Agen', half:true },
    { key:'land_area',     label:'Luas Tanah (m²)',    half:true },
    { key:'building_area', label:'Luas Bangunan (m²)', half:true },
    { key:'bedrooms',      label:'Kamar Tidur',        half:true },
    { key:'bathrooms',     label:'Kamar Mandi',        half:true },
    { key:'carport',       label:'Carport',            half:true },
    { key:'facilities',    label:'Fasilitas',          half:false },
    { key:'description',   label:'Deskripsi',          half:false, textarea:true },
  ];

  const SELECT_FIELDS = [
    { key:'floors',      label:'Jumlah Lantai' },
    { key:'certificate', label:'Sertifikat' },
    { key:'electricity', label:'Listrik' },
    { key:'water',       label:'Sumber Air' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize:'1.1rem' }}>{isNew ? '➕ Tambah Properti Manual' : '🏠 Detail Properti'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Photo Gallery */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginBottom:8 }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position:'relative', aspectRatio:'3/4', borderRadius:8, overflow:'hidden', background:'rgba(0,0,0,0.3)' }}>
                <img src={src} alt={`foto ${i+1}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                {isEditing && (
                  <button onClick={() => removePhoto(i)}
                    style={{ position:'absolute', top:4, right:4, background:'rgba(239,68,68,0.9)', border:'none', color:'#fff', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                )}
              </div>
            ))}
            {isEditing && photos.length < 8 && (
              <div onClick={() => fileRef.current.click()}
                style={{ aspectRatio:'3/4', borderRadius:8, border:'2px dashed var(--glass-border)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-muted)', gap:4, fontSize:'0.75rem' }}>
                <span style={{ fontSize:'1.5rem' }}>📷</span>
                <span>Tambah Foto</span>
                <span>({photos.length}/8)</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple style={{ display:'none' }} onChange={handlePhotoUpload} />
          {isEditing && <p style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>Format JPEG/PNG, maks. 8 foto, rasio 3:4 atau 4:3.</p>}
        </div>

        {/* Dropdown Fields */}
        <div className="modal-body" style={{ marginBottom:16 }}>
          {SELECT_FIELDS.map(f => (
            <div key={f.key} className="form-group half">
              <label>{f.label}</label>
              {isEditing ? (
                <select className="form-input" value={formData[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                  <option value="">— Pilih —</option>
                  {DROPDOWN_OPTIONS[f.key].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <div className="readonly-field">{formData[f.key] || '-'}</div>
              )}
            </div>
          ))}
        </div>

        {/* Text Fields */}
        <div className="modal-body">
          {TEXT_FIELDS.map(f => (
            <div key={f.key} className={`form-group ${f.half ? 'half' : 'full-width'}`}>
              <label>{f.label}</label>
              {isEditing ? (
                f.textarea ? (
                  <textarea className="form-input" rows={3} value={formData[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                ) : (
                  <input type="text" className="form-input" value={formData[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                )
              ) : (
                <div className="readonly-field" style={{ whiteSpace: f.textarea ? 'pre-wrap' : 'normal' }}>
                  {formData[f.key] || '-'}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          {!isEditing ? (
            <button className="btn-primary" onClick={() => setIsEditing(true)}>✏️ Edit Data</button>
          ) : (
            <>
              {!isNew && (
                <button className="btn-primary"
                  style={{ background:'transparent', border:'1px solid var(--text-muted)' }}
                  onClick={() => { setFormData(prop); setPhotos(prop.photos||[]); setIsEditing(false); }}>
                  Batal
                </button>
              )}
              <button className="btn-primary" style={{ background:'var(--success)' }} onClick={handleSave}>
                💾 Simpan
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
