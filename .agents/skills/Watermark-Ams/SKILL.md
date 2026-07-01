---
name: Watermark-Ams
description: "Memasang watermark developer melayang (floating credit bubble) dengan inisial AMS dan link ke profil GitHub di setiap proyek aplikasi web."
---

# Developer Watermark Skill (AMS Signature)

Panduan ini digunakan untuk menyisipkan tanda tangan (watermark) pembuat aplikasi di setiap sistem web/dashboard yang didevelop untuk user dengan inisial/logo AMS melayang transparan.

## Langkah Pemasangan (Otomatis):
1. **Salin File Logo**: Salin file `ams-logo.png` dari folder skill ini (`.agents/skills/Watermark-Ams/ams-logo.png`) ke folder `public/` proyek tujuan Anda dengan nama `ams-logo.png`.
2. **Tambahkan CSS**: Salin kode CSS di bagian **1. Gaya CSS** ke file CSS global proyek Anda (seperti `globals.css` atau `layout.css`).
3. **Integrasikan Layout**: Sisipkan kode React di bagian **2. Struktur React Component** ke file layout utama/wrapper proyek Anda.

## 1. Gaya CSS (Tempatkan di CSS Global)
```css
/* ── Developer Watermark ── */
.dev-watermark-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9999;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: none;
}

.dev-watermark-btn:hover {
  transform: scale(1.1) rotate(5deg);
}

.dev-watermark-btn:active {
  transform: scale(0.95);
}

.dev-watermark-popup {
  position: fixed;
  bottom: 84px;
  right: 24px;
  width: 320px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  z-index: 9998;
  animation: slideUpFade 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@keyframes slideUpFade {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dev-watermark-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #0f766e;
  background: #f0fdfa;
  padding: 4px 10px;
  border-radius: 99px;
  width: fit-content;
  border: 1px solid #ccfbf1;
  font-weight: 600;
}

.dev-watermark-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #14b8a6;
  box-shadow: 0 0 8px #14b8a6;
  animation: pulseGlow 2s infinite;
}

@keyframes pulseGlow {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 12px #14b8a6; }
  100% { transform: scale(1); opacity: 0.6; }
}
```

## 2. Struktur React Component (Sering diletakkan di Layout Utama)
```tsx
import { useState } from 'react';

// Letakkan di dalam return layout root utama
const [showDevOverlay, setShowDevOverlay] = useState(false);

return (
  <>
    {/* Konten Utama Aplikasi */}
    {children}

    {/* Developer Watermark */}
    <div 
      className="dev-watermark-btn" 
      onClick={() => setShowDevOverlay(!showDevOverlay)}
      title="Developer Info"
    >
      <img 
        src="/ams-logo.png" 
        alt="AMS Logo" 
        style={{ width: '38px', height: '38px', objectFit: 'contain' }} 
      />
    </div>

    {showDevOverlay && (
      <div className="dev-watermark-popup">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 700 }}>Developer Credit</span>
          <div className="dev-watermark-status">
            <span className="dev-watermark-dot" />
            <span>Active Release</span>
          </div>
        </div>
        <div>
          <img 
            src="/ams-logo.png" 
            alt="AMS Logo" 
            style={{ height: '36px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} 
          />
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
            Designed, built, and optimized with Next.js, Prisma, and custom styling.
          </p>
        </div>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: '#64748b' }}>System Version</span>
          <strong style={{ color: '#1e293b' }}>v1.0.0</strong>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <a 
            href="https://github.com/armansyam"
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              flex: 1,
              textAlign: 'center',
              background: 'var(--primary, #6366F1)',
              color: 'white',
              padding: '8px 0',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.2)'
            }}
          >
            GitHub Profile
          </a>
          <button 
            onClick={() => setShowDevOverlay(false)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: 'white',
              color: '#64748b',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    )}
  </>
);
```
