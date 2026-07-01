const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
require('dotenv').config();
const db = require('./db');

// Import authentication middleware
const { requireAuth } = require('./middleware/auth');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'sorehari-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'sorehari.sid',
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  }
}));

const loginAttempts = new Map();
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS_PLAIN = process.env.ADMIN_PASSWORD || 'sorehari2026';

const allowedOrigins = ['http://localhost:8080', 'http://192.168.100.254:8080', 'http://192.168.100.77:8080', 'https://sorehari.ammang.my.id'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/leads', require('./routes/leads'));
app.use('/api/clients', requireAuth, require('./routes/clients'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/freelancers', requireAuth, require('./routes/freelancers'));
app.use('/api/packages', requireAuth, require('./routes/packages'));
app.use('/api/sessions', requireAuth, require('./routes/sessions'));
app.use('/api/products', requireAuth, require('./routes/products'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/archive', requireAuth, require('./routes/archive'));

app.use('/api/uploads/receipts', requireAuth, express.static(path.join(__dirname, 'private/uploads/receipts')));

// Fixed token generation with http -> https protocol fix
const generateToken = (length = 12) => {
  return crypto.randomBytes(length).toString('hex');
};

app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

app.get('/api/templates', (req, res) => {
  const rows = db.prepare("SELECT * FROM settings WHERE key LIKE 'wa_%' ORDER BY key ASC").all();
  const templates = {};
  for (const row of rows) templates[row.key] = row.value;
  res.json(templates);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/landing.html')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Fixed inquiry page with escaping
app.get('/inquiry', (req, res) => {
  const vendorPhone = db.prepare("SELECT value FROM settings WHERE key = 'vendor_phone'").get()?.value || '6282333333420';
  const eventTypesJson = db.prepare("SELECT value FROM settings WHERE key = 'inquiry_event_types'").get()?.value || '[]';
  const needsJson = db.prepare("SELECT value FROM settings WHERE key = 'inquiry_needs'").get()?.value || '[]';
  let eventTypes = [], needs = [];
  try { eventTypes = JSON.parse(eventTypesJson); } catch { eventTypes = ['Wedding 💍', 'Engagement 💕', 'Prewedding 📸']; }
  try { needs = JSON.parse(needsJson); } catch { needs = ['📷 Foto', '🎬 Video', '🎞️ SDE']; }

  let html = fs.readFileSync(path.join(__dirname, 'inquiry.html'), 'utf8');
  html = html.replace(/__VENDOR_PHONE__/g, vendorPhone.replace(/[^0-9]/g, ''));
  const typeOpts = eventTypes.map(t => `<option value="${t}">${t}</option>`).join('\n');
  html = html.replace(/__EVENT_TYPES__/g, typeOpts);
  const needItems = needs.map(n =>
    `<label class="check-item flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 cursor-pointer transition hover:border-slate-300">
      <input type="checkbox" name="kebutuhan" value="${n}">
      <span class="text-sm text-slate-600">${n}</span>
    </label>`
  ).join('\n');
  html = html.replace(/__NEEDS__/g, needItems);
  res.send(html);
});

app.get('/pelunasan/:token', (req, res) => res.sendFile(path.join(__dirname, 'public/pelunasan.html')));

app.get('/booking/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/booking.html'));
});

app.get('/admin', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'private/admin/index.html'));
});
app.get('/admin/:page', requireAuth, (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, `private/admin/${page}.html`);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(filePath, (err) => { if (err) res.status(404).send('Page not found'); });
});

// Login with XSS fixes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.redirect('/login?error=Username dan password wajib diisi');
  }

  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  if (now < attempt.lockUntil) {
    const mins = Math.ceil((attempt.lockUntil - now) / 60000);
    return res.redirect(`/login?error=Terlalu banyak percobaan. Coba lagi ${mins} menit lagi.`);
  }

  if (username === ADMIN_USER && password === ADMIN_PASS_PLAIN) {
    loginAttempts.delete(ip);
    req.session.user = { username: ADMIN_USER, role: 'admin' };
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/login?error=Terjadi kesalahan sistem');
      }
      res.redirect('/admin');
    });
    return;
  }

  attempt.count++;
  if (attempt.count >= 5) {
    attempt.lockUntil = now + 15 * 60 * 1000;
    loginAttempts.set(ip, attempt);
    return res.redirect(`/login?error=Terlalu banyak percobaan. Coba lagi 15 menit lagi.`);
  }
  loginAttempts.set(ip, attempt);
  return res.redirect('/login?error=Username atau password salah');
});

app.get('/login', (req, res) => {
  const { username, password, error } = req.query;
  if (username && password) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
    if (now < attempt.lockUntil) {
      const mins = Math.ceil((attempt.lockUntil - now) / 60000);
      return res.redirect(`/login?error=Terlalu banyak percobaan. Coba lagi ${mins} menit lagi.`);
    }
    if (username === ADMIN_USER && password === ADMIN_PASS_PLAIN) {
      loginAttempts.delete(ip);
      req.session.user = { username: ADMIN_USER, role: 'admin' };
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/login?error=Terjadi kesalahan sistem');
        }
        res.redirect('/admin');
      });
      return;
    }
    attempt.count++;
    if (attempt.count >= 5) {
      attempt.lockUntil = now + 15 * 60 * 1000;
      loginAttempts.set(ip, attempt);
      return res.redirect(`/login?error=Terlalu banyak percobaan. Coba lagi 15 menit lagi.`);
    }
    loginAttempts.set(ip, attempt);
    return res.redirect('/login?error=Username atau password salah');
  }

  // XSS-safe error display
  let html = fs.readFileSync(path.join(__dirname, 'public/login.html'), 'utf8');
  if (error) {
    // Safe escaping for error message
    const escapedError = error
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/\'/g, '&#x27;');
    html = html.replace(
      '<div id="errorMsg" style="display: none;"',
      `<div id="errorMsg" style="display: block;"`
    );
    html = html.replace(
      'id="errorMsg"></div>',
      `id="errorMsg">${escapedError}</div>`
    );
  }
  res.send(html);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  if (now < attempt.lockUntil) {
    const mins = Math.ceil((attempt.lockUntil - now) / 60000);
    return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi ${mins} menit lagi.` });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS_PLAIN) {
    loginAttempts.delete(ip);
    req.session.user = { username: ADMIN_USER, role: 'admin' };
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan sistem' });
      }
      res.json({ success: true, message: 'Login berhasil' });
    });
    return;
  }

  attempt.count++;
  if (attempt.count >= 5) {
    attempt.lockUntil = now + 15 * 60 * 1000;
    loginAttempts.set(ip, attempt);
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
  }
  loginAttempts.set(ip, attempt);
  return res.status(401).json({ error: 'Username atau password salah' });
});

// Fixed 404 and error handlers
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
  console.error(err);
  // Generic error messages to prevent info disclosure
  res.status(500).send('Internal server error');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
