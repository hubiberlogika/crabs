import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('target');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card'
  const [properties, setProperties] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  
  // Scraper form state
  const [targetUsername, setTargetUsername] = useState('');
  const [viewerUsername, setViewerUsername] = useState(localStorage.getItem('ig_viewer_user') || '');
  const [viewerPassword, setViewerPassword] = useState(localStorage.getItem('ig_viewer_pass') || '');
  const [sessionId, setSessionId] = useState(localStorage.getItem('ig_session_id') || '');
  
  // Handlers untuk save auto ke localStorage
  const handleSessionChange = (val) => { setSessionId(val); localStorage.setItem('ig_session_id', val); }
  const handleUserChange = (val) => { setViewerUsername(val); localStorage.setItem('ig_viewer_user', val); }
  const handlePassChange = (val) => { setViewerPassword(val); localStorage.setItem('ig_viewer_pass', val); }

  const [scrapeLimit, setScrapeLimit] = useState(10);
  const [agentFilter, setAgentFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

  useEffect(() => {
    if (activeTab === 'hasil') {
      fetchProperties();
    }
  }, [activeTab]);

  const fetchProperties = async () => {
    try {
      const res = await fetch(`${API_URL}/api/properties`);
      const data = await res.json();
      if (data.data) {
        setProperties(data.data);
      }
    } catch (err) {
      console.error("Error fetching properties:", err);
    }
  };

  const handleScrape = async () => {
    if (!targetUsername) {
      setStatusMsg("Mohon isi Target Username!");
      return;
    }

    setLoading(true);
    setStatusMsg("Sedang memulai proses...");
    try {
      const res = await fetch(`${API_URL}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_username: targetUsername,
          viewer_username: viewerUsername,
          viewer_password: viewerPassword,
          session_id: sessionId,
          limit: parseInt(scrapeLimit) || 10
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(data.message || "Proses scraping selesai.");
        setTimeout(() => {
          setActiveTab('hasil');
          setStatusMsg('');
        }, 1500);
      } else {
        setStatusMsg("Gagal: " + (data.detail || "Terjadi kesalahan server."));
      }
    } catch (err) {
      setStatusMsg("Gagal menghubungi server. Mungkin timeout.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id, field, value) => {
    // Optimistic UI update
    setProperties(properties.map(p => p.id === id ? { ...p, [field]: value } : p));
    
    // API Call
    try {
      await fetch(`${API_URL}/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
    } catch (err) {
      console.error("Gagal update data:", err);
    }
  };

  const filteredProperties = properties.filter(prop => {
    if (agentFilter && prop.agent_name) {
      const name = prop.agent_name.split('(')[0].trim();
      if (!name.toLowerCase().includes(agentFilter.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="app-container">
      <header className="header">
        <h1>IG Real Estate</h1>
      </header>

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'target' ? 'active' : ''}`}
          onClick={() => setActiveTab('target')}
        >
          Target IG
        </button>
        <button 
          className={`tab-btn ${activeTab === 'hasil' ? 'active' : ''}`}
          onClick={() => setActiveTab('hasil')}
        >
          Hasil
        </button>
      </div>

      <main className="content">
        {activeTab === 'target' ? (
          <div className="form-wrapper">
            <div className="glass" style={{ padding: '20px' }}>
              
              {/* BOX 1: TARGET */}
              <div style={{ background: 'rgba(14, 165, 233, 0.1)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🎯 1. Target IG
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                  Akun Instagram yang datanya akan ditarik (discrabe).
                </p>
                <div className="form-group">
                  <label>Username IG Target</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Contoh: @rumah.idaman" 
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'var(--accent)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Jumlah Data (Maks. 100 per hari/scrape)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="1" max="100"
                    value={scrapeLimit}
                    onChange={(e) => setScrapeLimit(e.target.value)}
                  />
                </div>
              </div>
              
              {/* BOX 2: VIEWER */}
              <details style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', marginBottom: '24px', cursor: 'pointer' }}>
                <summary style={{ fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', outline: 'none' }}>
                  ⚙️ 2. Pengaturan Bot (Tersimpan Otomatis)
                </summary>
                
                <div style={{ marginTop: '15px', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                    Data ini <b>tersimpan permanen</b> di browser Anda sehingga cukup di-setting sekali. Gunakan <b>Session ID</b> (sangat disarankan) ATAU isi Username & Password.
                  </p>
                  
                  <div className="form-group" style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '8px', border: '1px dashed #10b981' }}>
                    <label>IG Session ID (Cookie - Paling Aman!)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Contoh: 51928374%3Ax8k..." 
                      value={sessionId}
                      onChange={(e) => handleSessionChange(e.target.value)}
                    />
                  </div>

                  <div style={{ textAlign: 'center', margin: '15px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ATAU (Alternatif)</div>

                  <div className="form-group">
                    <label>Username Viewer (Akun Bot)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Contoh: bot_viewer_1" 
                      value={viewerUsername}
                      onChange={(e) => handleUserChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Password Viewer</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="••••••••" 
                      value={viewerPassword}
                      onChange={(e) => handlePassChange(e.target.value)}
                    />
                  </div>
                </div>
              </details>

              <button 
                className="btn-primary" 
                onClick={handleScrape} 
                disabled={loading}
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Memproses...' : 'Mulai Scraping'}
              </button>
              {statusMsg && <p style={{marginTop: '15px', textAlign: 'center', color: 'var(--accent)'}}>{statusMsg}</p>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
              <div className="filters-scroll" style={{ marginBottom: 0, paddingBottom: 0, display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div className="filter-pill" onClick={fetchProperties} style={{ cursor: 'pointer' }}>🔄 Refresh Data</div>
                
                <select 
                  className="filter-pill" 
                  style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-main)', outline: 'none' }}
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                >
                  <option value="" style={{color: 'black'}}>👤 Semua Agen</option>
                  {[...new Set(properties.map(p => {
                    const name = p.agent_name?.split('(')[0].trim();
                    return name && name.length > 2 ? name : null;
                  }).filter(Boolean))].map(agent => (
                    <option key={agent} value={agent} style={{color: 'black'}}>{agent}</option>
                  ))}
                </select>
                
              </div>
              <div className="view-toggle" style={{ marginBottom: 0 }}>
                <button className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>Tabel</button>
                <button className={`toggle-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>Cards</button>
              </div>
            </div>

            {viewMode === 'table' ? (
              <div className="table-container glass">
                <table>
                  <thead>
                    <tr>
                      <th>Harga</th>
                      <th>LT</th>
                      <th>LB</th>
                      <th>KT</th>
                      <th>KM</th>
                      <th>Lantai</th>
                      <th>Agen</th>
                      <th>Fasilitas</th>
                      <th>Carport</th>
                      <th>Listrik</th>
                      <th>Air</th>
                      <th>Surat</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProperties.map(prop => (
                      <tr key={prop.id}>
                        <EditableCell 
                          value={prop.price || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'price'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'price' })}
                          onChange={(val) => handleEdit(prop.id, 'price', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.land_area || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'land_area'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'land_area' })}
                          onChange={(val) => handleEdit(prop.id, 'land_area', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.building_area || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'building_area'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'building_area' })}
                          onChange={(val) => handleEdit(prop.id, 'building_area', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.bedrooms || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'bedrooms'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'bedrooms' })}
                          onChange={(val) => handleEdit(prop.id, 'bedrooms', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.bathrooms || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'bathrooms'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'bathrooms' })}
                          onChange={(val) => handleEdit(prop.id, 'bathrooms', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.floors || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'floors'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'floors' })}
                          onChange={(val) => handleEdit(prop.id, 'floors', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.agent_name || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'agent_name'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'agent_name' })}
                          onChange={(val) => handleEdit(prop.id, 'agent_name', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.facilities || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'facilities'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'facilities' })}
                          onChange={(val) => handleEdit(prop.id, 'facilities', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.carport || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'carport'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'carport' })}
                          onChange={(val) => handleEdit(prop.id, 'carport', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.electricity || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'electricity'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'electricity' })}
                          onChange={(val) => handleEdit(prop.id, 'electricity', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.water || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'water'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'water' })}
                          onChange={(val) => handleEdit(prop.id, 'water', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <EditableCell 
                          value={prop.certificate || '-'} 
                          isEditing={editingCell?.id === prop.id && editingCell?.field === 'certificate'}
                          onDoubleClick={() => setEditingCell({ id: prop.id, field: 'certificate' })}
                          onChange={(val) => handleEdit(prop.id, 'certificate', val)}
                          onBlur={() => setEditingCell(null)}
                        />
                        <td>
                          <a href={prop.ig_post_url} target="_blank" rel="noreferrer" className="action-link">Buka IG</a>
                        </td>
                      </tr>
                    ))}
                    {filteredProperties.length === 0 && (
                      <tr>
                        <td colSpan="13" style={{textAlign: 'center', padding: '20px', color: 'var(--text-muted)'}}>
                          Belum ada data properti atau agen tidak ditemukan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p style={{textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px', paddingBottom: '10px'}}>
                  Tap 2x untuk edit manual. Data tersimpan otomatis ke Neon DB.
                </p>
              </div>
            ) : (
              <div className="cards-grid">
                {properties.map(prop => (
                  <div key={prop.id} className="property-card glass">
                    <div className="card-header">
                      <div className="card-price">{prop.price || 'Harga -'}</div>
                      <a href={prop.ig_post_url} target="_blank" rel="noreferrer" className="action-link">Buka IG</a>
                    </div>
                    <div className="card-agent">👤 {prop.agent_name || 'Tidak diketahui'}</div>
                    
                    <div className="card-grid-details">
                      <div className="card-detail-item"><strong>LT / LB</strong>{prop.land_area || '-'} / {prop.building_area || '-'}</div>
                      <div className="card-detail-item"><strong>Kamar (KT/KM)</strong>{prop.bedrooms || '-'} / {prop.bathrooms || '-'}</div>
                      <div className="card-detail-item"><strong>Lantai</strong>{prop.floors || '-'}</div>
                      <div className="card-detail-item"><strong>Sertifikat</strong>{prop.certificate || '-'}</div>
                    </div>
                    
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                      {prop.facilities && <div style={{marginBottom: '4px'}}>✨ {prop.facilities}</div>}
                      <div style={{display:'flex', gap: '15px', marginTop: '6px'}}>
                        {prop.carport && <span>🚗 {prop.carport}</span>}
                        {prop.electricity && <span>⚡ {prop.electricity}</span>}
                        {prop.water && <span>💧 {prop.water}</span>}
                      </div>
                    </div>
                    
                    <div className="card-footer">
                      <span>Diambil: {new Date(prop.scraped_at).toLocaleDateString('id-ID')}</span>
                      <span style={{color: 'var(--accent)', cursor: 'pointer', fontWeight: 500}} onClick={() => setViewMode('table')}>✏️ Edit (via Tabel)</span>
                    </div>
                  </div>
                ))}
                {filteredProperties.length === 0 && (
                  <div style={{textAlign: 'center', padding: '20px', color: 'var(--text-muted)', gridColumn: '1 / -1'}}>
                    Belum ada data properti atau agen tidak ditemukan.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function EditableCell({ value, isEditing, onDoubleClick, onChange, onBlur }) {
  if (isEditing) {
    return (
      <td className="editable">
        <input 
          autoFocus
          className="edit-input"
          value={value === '-' ? '' : value} 
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') onBlur() }}
        />
      </td>
    );
  }
  return (
    <td className="editable" onClick={onDoubleClick}>
      {value}
    </td>
  );
}

export default App;
