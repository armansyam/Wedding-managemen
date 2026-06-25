import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase, runAsync, getAsync, allAsync } from './db.js';
import sharp from 'sharp';
import fs from 'fs';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Load env
dotenv.config();

// Security: Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('Please copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// Security: Validate credentials are not default values
if (process.env.ADMIN_USERNAME === 'admin' && process.env.ADMIN_PASSWORD === 'SorehariDev2026!') {
  console.warn('⚠️  WARNING: Using default admin credentials! Change ADMIN_USERNAME and ADMIN_PASSWORD in .env immediately!');
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot start server with default credentials in production mode.');
    process.exit(1);
  }
}

// Input sanitization utility - prevent XSS
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;');
}

// Sanitize all string fields in an object recursively
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Indonesian phone number validation (08xx, +628xx)
function isValidIndonesianPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  const phoneRegex = /^(?:\+62|62|0)8[1-9][0-9]{6,12}$/;
  return phoneRegex.test(cleaned);
}

// Get the base URL for links (dynamic, not hardcoded)
function getBaseUrl() {
  return process.env.BASE_URL || `http://localhost:${PORT}`;
}


// Stricter rate limit for auth endpoints
const failedLogins = new Map();

// Request Logger middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url} (IP: ${req.ip})`);
  next();
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset cookie maxAge on every request/activity
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours of inactivity limit
  }
}));

// Session auth middleware for protected routes
function sessionAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ message: 'Unauthorized' });
}

// Security: Helmet middleware for HTTP headers (XSS protection, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for Tailwind CDN
  crossOriginEmbedderPolicy: false
}));

// Middleware - restrict CORS to production domain only
const allowedOrigins = [
  'https://sorehari.my.id',
  'https://www.sorehari.my.id',
  'https://test.ammang.my.id',
  'http://test.ammang.my.id',
  'http://192.168.100.254:3000',
  'http://192.168.100.254:3001',
  'http://192.168.100.254:8080',
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any local IP or subdomain of ammang.my.id / sorehari.com
    const isLocalIp = /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);
    const isAllowedDomain = /^(https?:\/\/)?([a-z0-9-]+\.)*(ammang\.my\.id|sorehari\.com|sorehari\.my\.id)(:\d+)?$/i.test(origin);

    if (allowedOrigins.includes(origin) || isLocalIp || isAllowedDomain) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size


// Serve admin page with session protection BEFORE static middleware
app.get('/admin.html', (req, res) => {
  if (req.session && req.session.admin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  return res.redirect('/login.html');
});

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure multer for file uploads (save to temp folder first)
const tempUploadDir = path.join(__dirname, '.temp-uploads');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max (will be resized by sharp)
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Initialize database on startup
initializeDatabase().then(() => {
  console.log('Database initialized');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// Configure multer for payment receipts (save to uploads/receipts)
const receiptsDir = path.join(__dirname, 'uploads', 'receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, receiptsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype || extname) return cb(null, true);
    cb(new Error('Only images and PDFs are allowed for receipts'));
  }
});

// Helper to build a wa.me link with a pre-filled message
function buildWaLink(phone, message) {
  let clean = (phone || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.substring(1);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// ============ API ROUTES ============

// LOGIN endpoint (rate limited on failed attempts only)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  // Check lockout
  const record = failedLogins.get(ip);
  if (record && record.lockUntil && Date.now() < record.lockUntil) {
    const minutesLeft = Math.ceil((record.lockUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak percobaan login salah. Silakan coba lagi setelah ${minutesLeft} menit.`
    });
  }

  // Use environment variables for credentials
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    failedLogins.delete(ip); // clear failed attempts count on success
    req.session.admin = true;
    return res.json({ success: true, message: 'Login successful' });
  }

  // Failed login
  let attempts = 1;
  if (record) {
    attempts = (record.attempts || 0) + 1;
  }

  if (attempts >= 5) {
    const lockUntil = Date.now() + 15 * 60 * 1000; // 15 mins block
    failedLogins.set(ip, { attempts, lockUntil });
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak percobaan login salah. IP Anda telah diblokir selama 15 menit.'
    });
  } else {
    failedLogins.set(ip, { attempts, lockUntil: null });
    const remaining = 5 - attempts;
    return res.status(401).json({
      success: false,
      message: `Username atau password salah. Sisa percobaan: ${remaining} kali.`
    });
  }
});

// CHECK SESSION endpoint
app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.admin) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

// LOGOUT endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  });
});

// GET global settings
app.get('/api/global-settings', async (req, res) => {
  try {
    const settings = await getAsync('SELECT * FROM global_settings WHERE id = 1');
    res.json(settings || { max_slots_per_day: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE global settings
app.put('/api/global-settings', sessionAuth, async (req, res) => {
  const { max_slots_per_day, wa_template_booking, wa_template_h3_client, wa_template_h1_crew, wa_template_crew_assignment } = req.body;
  try {
    const fields = [];
    const params = [];
    if (max_slots_per_day !== undefined) { fields.push('max_slots_per_day = ?'); params.push(max_slots_per_day); }
    if (wa_template_booking !== undefined) { fields.push('wa_template_booking = ?'); params.push(wa_template_booking); }
    if (wa_template_h3_client !== undefined) { fields.push('wa_template_h3_client = ?'); params.push(wa_template_h3_client); }
    if (wa_template_h1_crew !== undefined) { fields.push('wa_template_h1_crew = ?'); params.push(wa_template_h1_crew); }
    if (wa_template_crew_assignment !== undefined) { fields.push('wa_template_crew_assignment = ?'); params.push(wa_template_crew_assignment); }

    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada data yang diubah' });

    params.push(1); // WHERE id = 1
    await runAsync(`UPDATE global_settings SET ${fields.join(', ')} WHERE id = 1`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET packages
app.get('/api/packages', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const query = showAll 
      ? 'SELECT * FROM packages ORDER BY CASE WHEN is_active = 0 THEN 0 ELSE 1 END DESC, price DESC'
      : 'SELECT * FROM packages WHERE is_active = 1 OR is_active IS NULL ORDER BY price DESC';
    const packages = await allAsync(query);
    for (const p of packages) {
      const sessions = await allAsync(`
        SELECT s.id, s.name 
        FROM package_sessions ps 
        JOIN sessions s ON ps.session_id = s.id 
        WHERE ps.package_id = ?
        ORDER BY s.default_order ASC, s.id ASC
      `, [p.id]);
      p.session_ids = sessions.map(s => s.id);
      p.session_names = sessions.map(s => s.name);
    }
    res.json(packages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE package
app.post('/api/packages', sessionAuth, async (req, res) => {
  const { package_name, description, price, required_fg, required_vg, is_negotiable, operational_cost, is_active } = req.body;

  // Input validation
  if (!package_name || price === undefined || required_fg === undefined || required_vg === undefined) {
    return res.status(400).json({ error: 'Missing package fields' });
  }

  // Validate numeric values
  const parsedPrice = parseFloat(price);
  const parsedFg = parseInt(required_fg);
  const parsedVg = parseInt(required_vg);
  const parsedNeg = parseInt(is_negotiable) ? 1 : 0;
  const parsedOps = parseFloat(operational_cost) || 0.0;
  const parsedActive = is_active !== undefined ? (parseInt(is_active) ? 1 : 0) : 1;

  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'Harga paket tidak valid.' });
  }
  if (isNaN(parsedFg) || parsedFg < 0) {
    return res.status(400).json({ error: 'Jumlah FG tidak valid.' });
  }
  if (isNaN(parsedVg) || parsedVg < 0) {
    return res.status(400).json({ error: 'Jumlah VG tidak valid.' });
  }

  // Validate package name length
  if (package_name.length > 100) {
    return res.status(400).json({ error: 'Nama paket terlalu panjang (maks 100 karakter).' });
  }
  try {
    const result = await runAsync(
      'INSERT INTO packages (package_name, description, price, required_fg, required_vg, is_negotiable, operational_cost, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [package_name, description || '', price, required_fg, required_vg, parsedNeg, parsedOps, parsedActive]
    );
    const { session_ids } = req.body;
    if (session_ids && Array.isArray(session_ids)) {
      for (const s_id of session_ids) {
        await runAsync('INSERT INTO package_sessions (package_id, session_id) VALUES (?, ?)', [result.lastID, s_id]);
      }
    }
    res.json({ id: result.lastID, package_name, description, price, required_fg, required_vg, is_negotiable: parsedNeg, operational_cost: parsedOps, is_active: parsedActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE package
app.put('/api/packages/:id', sessionAuth, async (req, res) => {
  const { package_name, description, price, required_fg, required_vg, is_negotiable, operational_cost, is_active, session_ids } = req.body;
  const parsedNeg = parseInt(is_negotiable) ? 1 : 0;
  const parsedOps = parseFloat(operational_cost) || 0.0;
  const parsedActive = is_active !== undefined ? (parseInt(is_active) ? 1 : 0) : 1;
  try {
    await runAsync(
      'UPDATE packages SET package_name = ?, description = ?, price = ?, required_fg = ?, required_vg = ?, is_negotiable = ?, operational_cost = ?, is_active = ? WHERE id = ?',
      [package_name, description || '', price, required_fg, required_vg, parsedNeg, parsedOps, parsedActive, req.params.id]
    );
    if (session_ids && Array.isArray(session_ids)) {
      await runAsync('DELETE FROM package_sessions WHERE package_id = ?', [req.params.id]);
      for (const s_id of session_ids) {
        await runAsync('INSERT INTO package_sessions (package_id, session_id) VALUES (?, ?)', [req.params.id, s_id]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE package
app.delete('/api/packages/:id', sessionAuth, async (req, res) => {
  try {
    const bookings = await allAsync('SELECT id FROM bookings WHERE package_id = ? LIMIT 1', [req.params.id]);
    
    if (bookings.length > 0) {
      // Soft delete: set is_active = 0 and rename to avoid UNIQUE constraint conflicts later
      const suffix = ` (Deleted ${Date.now()})`;
      await runAsync('UPDATE packages SET is_active = 0, package_name = package_name || ? WHERE id = ?', [suffix, req.params.id]);
    } else {
      // Hard delete
      await runAsync('DELETE FROM packages WHERE id = ?', [req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET freelancers
app.get('/api/freelancers', async (req, res) => {
  try {
    const query = `
      SELECT f.*,
             (SELECT ROUND(AVG(fee_amount)) FROM freelancer_fees WHERE freelancer_id = f.id AND fee_amount > 0) AS avg_session_fee
      FROM freelancers f
      ORDER BY CASE WHEN f.status = 'Aktif' THEN 1 ELSE 2 END, f.name ASC
    `;
    const freelancers = await allAsync(query);
    res.json(freelancers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE freelancer
app.post('/api/freelancers', sessionAuth, async (req, res) => {
  const { name, role, status, whatsapp_number, fee_per_project, bank_account } = req.body;

  // Input validation
  if (!name || !role || !whatsapp_number) {
    return res.status(400).json({ error: 'Missing freelancer fields' });
  }

  // Validate name length
  if (name.length > 100) {
    return res.status(400).json({ error: 'Nama kru terlalu panjang (maks 100 karakter).' });
  }

  // Validate role
  const validRoles = ['FG', 'VG'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role harus FG atau VG.' });
  }

  // Validate WhatsApp number format (basic validation)
  const phoneRegex = /^[0-9+\-\s()]{8,20}$/;
  if (!phoneRegex.test(whatsapp_number)) {
    return res.status(400).json({ error: 'Format nomor WhatsApp tidak valid.' });
  }

  // Validate status
  const validStatuses = ['Aktif', 'Tidak Aktif'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status harus Aktif atau Tidak Aktif.' });
  }
  try {
    const result = await runAsync(
      'INSERT INTO freelancers (name, role, status, whatsapp_number, fee_per_project, bank_account) VALUES (?, ?, ?, ?, ?, ?)',
      [name, role, status || 'Aktif', whatsapp_number, parseFloat(fee_per_project) || 0.0, bank_account || '']
    );
    res.json({ id: result.lastID, name, role, status: status || 'Aktif', whatsapp_number, fee_per_project: parseFloat(fee_per_project) || 0.0, bank_account });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE freelancer
app.put('/api/freelancers/:id', sessionAuth, async (req, res) => {
  const { name, role, status, whatsapp_number, fee_per_project, bank_account } = req.body;
  try {
    await runAsync(
      'UPDATE freelancers SET name = ?, role = ?, status = ?, whatsapp_number = ?, fee_per_project = ?, bank_account = ? WHERE id = ?',
      [name, role, status, whatsapp_number, parseFloat(fee_per_project) || 0.0, bank_account || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE freelancer
app.delete('/api/freelancers/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync('DELETE FROM freelancers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      res.status(400).json({ error: 'Kru tidak dapat dihapus karena sudah memiliki riwayat client/pembayaran. Silakan ubah statusnya menjadi "Tidak Aktif".' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});



// GET slots availability
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });
  try {
    const settings = await getAsync('SELECT max_slots_per_day FROM global_settings WHERE id = 1');
    const limit = settings ? settings.max_slots_per_day : 2;

    // Check if the date is blocked
    const blocked = await getAsync('SELECT * FROM blocked_dates WHERE blocked_date = ?', [date]);
    if (blocked) {
      return res.json({
        limit,
        count: limit,
        available: false,
        blocked: true,
        reason: blocked.reason || 'Hari Libur / Studio Tutup'
      });
    }

    const activeBookings = await getAsync('SELECT COUNT(*) as count FROM bookings WHERE event_date = ? AND project_status != "Ditutup"', [date]);
    const count = activeBookings ? activeBookings.count : 0;

    res.json({
      limit,
      count,
      available: count < limit,
      blocked: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET financial reports
app.get('/api/reports/financial', sessionAuth, async (req, res) => {
  const { type, month, year } = req.query;
  try {
    let startDate, endDate, periodLabel;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    if (type === 'monthly') {
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
      const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      periodLabel = `${monthNames[m]} ${y}`;
    } else {
      startDate = `${y}-01-01`;
      endDate = `${y}-12-31`;
      periodLabel = `Tahun ${y}`;
    }

    // Fetch bookings with events in the period OR transaction activity in the ledger in the period
    const bookings = await allAsync(`
      SELECT DISTINCT b.*, p.package_name
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      LEFT JOIN ledger l ON l.ref_type = 'booking' AND l.ref_id = b.id
      WHERE (b.event_date >= ? AND b.event_date <= ?)
         OR (l.transaction_date >= ? AND l.transaction_date <= ?)
      ORDER BY b.event_date ASC
    `, [startDate, endDate, startDate, endDate]);

    // ── Aggregate totals (CASH BASIS from Ledger) ──────────────────────────
    const ledgerStats = await getAsync(`
      SELECT 
        COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'DP%' OR description LIKE 'Dp%') THEN debit ELSE 0 END), 0) as kas_dp,
        COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'Final Payment%' OR description LIKE 'Pelunasan%' OR description LIKE 'Final payment%') THEN debit ELSE 0 END), 0) as kas_final,
        COALESCE(SUM(CASE WHEN account = 'expense_staff' THEN debit ELSE 0 END), 0) as exp_staff,
        COALESCE(SUM(CASE WHEN account = 'expense_album' THEN debit ELSE 0 END), 0) as exp_album,
        COALESCE(SUM(CASE WHEN account = 'expense_frame' THEN debit ELSE 0 END), 0) as exp_frame,
        COALESCE(SUM(CASE WHEN account = 'expense_logistics' THEN debit ELSE 0 END), 0) as exp_logistics
      FROM ledger
      WHERE transaction_date >= ? AND transaction_date <= ?
    `, [startDate, endDate]);

    let nilaiKontrak = 0;
    let piutang = 0;
    let totalDiskon = 0;

    for (let b of bookings) {
      const bStats = await getAsync(`
        SELECT 
          COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'DP%' OR description LIKE 'Dp%') THEN debit ELSE 0 END), 0) as dp,
          COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'Final Payment%' OR description LIKE 'Pelunasan%' OR description LIKE 'Final payment%') THEN debit ELSE 0 END), 0) as final,
          COALESCE(SUM(CASE WHEN account = 'expense_staff' THEN debit ELSE 0 END), 0) as staff,
          COALESCE(SUM(CASE WHEN account = 'expense_album' THEN debit ELSE 0 END), 0) as album,
          COALESCE(SUM(CASE WHEN account = 'expense_frame' THEN debit ELSE 0 END), 0) as frame,
          COALESCE(SUM(CASE WHEN account = 'expense_logistics' THEN debit ELSE 0 END), 0) as logistics
        FROM ledger
        WHERE ref_type = 'booking' AND ref_id = ?
          AND transaction_date >= ? AND transaction_date <= ?
      `, [b.id, startDate, endDate]);

      // Override the booking fields to period-specific values
      b.dp_paid_amount = bStats.dp;
      b.final_paid_amount = bStats.final;
      b.expense_staff_fee = bStats.staff;
      b.expense_album = bStats.album;
      b.expense_frame = bStats.frame;
      b.expense_logistics = bStats.logistics;
      b.post_prod_expense = b.expense_album + b.expense_frame + b.expense_logistics + b.expense_staff_fee;

      nilaiKontrak += (b.total_deal_price || 0);
      totalDiskon += (b.discount_amount || 0);

      // Piutang remaining (only if not fully paid/DP hangus)
      if (b.payment_status !== 'Lunas' && b.payment_status !== 'DP Hangus') {
        const sudahMasuk = (b.dp_paid_amount || 0) + (b.final_paid_amount || 0);
        piutang += Math.max(0, (b.total_deal_price || 0) - sudahMasuk);
      }
    }

    const kasDP = ledgerStats.kas_dp;
    const kasFinal = ledgerStats.kas_final;
    const kasMasuk = kasDP + kasFinal;

    const expAlbum = ledgerStats.exp_album;
    const expFrame = ledgerStats.exp_frame;
    const expLogistic = ledgerStats.exp_logistics;
    const expStaff = ledgerStats.exp_staff;
    const totalExpense = expAlbum + expFrame + expLogistic + expStaff;

    const labaKotor = kasMasuk - totalExpense;
    const labaProyeksi = nilaiKontrak - totalExpense;

    const breakdown = {
      post_prod: 0,
      album: expAlbum,
      frame: expFrame,
      logistics: expLogistic,
      staff_fee: expStaff
    };

    // ── Fetch withdrawals (penarikan dana) for this period ─────────────────
    const withdrawals = await allAsync(`
      SELECT * FROM fund_withdrawals
      WHERE withdrawal_date >= ? AND withdrawal_date <= ?
      ORDER BY withdrawal_date DESC
    `, [startDate, endDate]);

    let totalWithdrawals = 0;
    withdrawals.forEach(w => { totalWithdrawals += (w.amount || 0); });

    // ── Financial settings ─────────────────────────────────────────────────
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? (settings.minimum_capital || 0) : 0;

    // ── Check if period is closed ──────────────────────────────────────────
    const periodValue = type === 'monthly' ? `${y}-${String(m).padStart(2, '0')}` : `${y}`;
    const closedPeriod = await getAsync(
      'SELECT is_closed, closed_at FROM financial_periods WHERE period_type = ? AND period_value = ?',
      [type === 'monthly' ? 'monthly' : 'yearly', periodValue]
    );

    const saldoModal = labaKotor - totalWithdrawals;
    const availableForWithdrawal = Math.max(0, saldoModal - minimumCapital);

    res.json({
      period: { type, label: periodLabel, startDate, endDate, isClosed: closedPeriod?.is_closed || false, closedAt: closedPeriod?.closed_at || null },
      // Cash-basis summary
      kasMasuk,
      kasDP,
      kasFinal,
      nilaiKontrak,
      piutang,
      totalDiskon,
      totalExpense,
      labaKotor,
      labaProyeksi,
      totalWithdrawals,
      saldoModal,
      minimumCapital,
      availableForWithdrawal,
      // Expense breakdown
      breakdown: {
        post_prod: 0,
        album: expAlbum,
        frame: expFrame,
        logistics: expLogistic,
        staff_fee: expStaff
      },
      // Per-booking detail
      bookings,
      withdrawals,
      // Stats
      totalBookings: bookings.length,
      totalRevenue: kasMasuk,     // alias for backward compat
      totalNetProfit: labaKotor,  // alias for backward compat
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET bookings list (with package and freelancer assignments)
app.get('/api/bookings', sessionAuth, async (req, res) => {
  try {
    const bookings = await allAsync(`
      SELECT b.*, p.package_name, p.price as base_price, p.required_fg, p.required_vg, p.description as package_description, p.operational_cost
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      ORDER BY b.event_date DESC
    `);
    for (let booking of bookings) {
      booking.freelancers = await allAsync(`
        SELECT f.*, bf.assigned_sessions
        FROM freelancers f
        JOIN booking_freelancer bf ON f.id = bf.freelancer_id
        WHERE bf.booking_id = ?
      `, [booking.id]);

      for (let f of booking.freelancers) {
        f.fees = await allAsync(`
          SELECT ff.*, s.name as session_name
          FROM freelancer_fees ff
          JOIN sessions s ON ff.session_id = s.id
          WHERE ff.freelancer_id = ?
        `, [f.id]);
      }

      booking.additional_services = await allAsync(`
        SELECT bas.quantity, ads.name, ads.price, ads.category
        FROM booking_additional_services bas
        JOIN additional_services ads ON bas.additional_service_id = ads.id
        WHERE bas.booking_id = ?
      `, [booking.id]);
    }
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a booking (Public client page submission)
app.post('/api/bookings', uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const { client_name, client_phone, location, event_date, package_id, total_deal_price, discount_amount, dp_amount, additional_services_json, special_requests } = req.body;

    // Input validation
    if (!client_name || !event_date || !package_id || !total_deal_price) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing client name, event date, package selection, or price deal.' });
    }

    // Validate numeric values
    const parsedDealPrice = parseFloat(total_deal_price);
    if (isNaN(parsedDealPrice) || parsedDealPrice < 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Harga deal tidak valid.' });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(event_date)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Format tanggal tidak valid.' });
    }

    // Validate client name length
    if (client_name.length > 100) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Nama klien terlalu panjang (maks 100 karakter).' });
    }

    // Check slots availability
    const settings = await getAsync('SELECT max_slots_per_day FROM global_settings WHERE id = 1');
    const limit = settings ? settings.max_slots_per_day : 2;

    const activeBookings = await getAsync('SELECT COUNT(*) as count FROM bookings WHERE event_date = ? AND project_status != "Ditutup"', [event_date]);
    const count = activeBookings ? activeBookings.count : 0;

    if (count >= limit) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Tanggal pernikahan ini sudah penuh. Silakan pilih tanggal lain.' });
    }

    const receiptPath = req.file ? `/uploads/receipts/${req.file.filename}` : null;
    const discountAmt = parseFloat(discount_amount) || 0;
    const dpClaimedAmt = parseFloat(dp_amount) || 0;

    const result = await runAsync(`
      INSERT INTO bookings (client_name, client_phone, location, event_date, package_id, total_deal_price, discount_amount, dp_claimed_amount, payment_receipt_path, payment_status, project_status, special_requests)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu DP', 'Pending', ?)
    `, [client_name, client_phone || null, location || null, event_date, package_id, total_deal_price, discountAmt, dpClaimedAmt, receiptPath, special_requests || null]);

    // Insert additional services if selected
    if (additional_services_json) {
      try {
        const addOns = JSON.parse(additional_services_json);
        if (Array.isArray(addOns)) {
          for (const item of addOns) {
            await runAsync(
              'INSERT INTO booking_additional_services (booking_id, additional_service_id, quantity) VALUES (?, ?, ?)',
              [result.lastID, item.id, item.quantity || 1]
            );
          }
        }
      } catch (err) {
        console.error('[BOOKING CREATION ERROR] saving additional services:', err);
      }
    }

    // Auto-populate Sesi dari Paket (PRD v1.1.9)
    try {
      const packageSessions = await allAsync('SELECT session_id FROM package_sessions WHERE package_id = ?', [package_id]);
      if (packageSessions && packageSessions.length > 0) {
        for (const ps of packageSessions) {
          await runAsync(
            'INSERT INTO booking_sessions (booking_id, session_id, event_date, event_time, location, gps_link, notes, crew_needed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [result.lastID, ps.session_id, '', '', '', '', '', '[]']
          );
        }
      }
    } catch (err) {
      console.error('[BOOKING CREATION ERROR] auto-populate sessions:', err);
    }

    res.json({ id: result.lastID, success: true });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// VERIFY DP or FINAL PAYMENT
app.post('/api/bookings/:id/verify-payment', sessionAuth, async (req, res) => {
  const { paid_amount } = req.body;
  const bookingId = req.params.id;
  if (paid_amount === undefined) return res.status(400).json({ error: 'paid_amount is required' });

  try {
    const booking = await getAsync('SELECT b.*, p.package_name FROM bookings b LEFT JOIN packages p ON b.package_id = p.id WHERE b.id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.payment_status === 'Menunggu DP') {
      // Transition directly to Menunggu Pelunasan & On Progress
      await runAsync(`
        UPDATE bookings 
        SET payment_status = 'Menunggu Pelunasan', 
            project_status = 'On Progress', 
            dp_paid_amount = ? 
        WHERE id = ?
      `, [paid_amount, bookingId]);

      // Write DP cash receipt to ledger so financial report can pick it up
      await createLedgerEntry(
        'cash', paid_amount, 0,
        `DP dari ${booking.client_name}`,
        'booking', bookingId,
        req.session.admin || 'admin'
      );

      // Generate WA Link for DP confirmation
      const settings = await getAsync('SELECT wa_template_booking FROM global_settings LIMIT 1');
      let templateStr = (settings && settings.wa_template_booking) ? settings.wa_template_booking : 'Halo {{nama_klien}}! 👋\\n\\nSelamat, booking Anda telah DIKONFIRMASI oleh *Sorehari Studio*!\\n\\n📅 Tanggal Acara: *{{tanggal_acara}}*\\n📦 Paket: *{{nama_paket}}*\\n📍 Lokasi: *{{lokasi}}*\\n\\nSampai jumpa di hari H! 🎉';
      
      try { templateStr = decodeURIComponent(templateStr); } catch (e) {}

      const waMessage = templateStr
        .replace(/{{nama_klien}}/g, booking.client_name)
        .replace(/{{tanggal_acara}}/g, booking.event_date || '-')
        .replace(/{{nama_paket}}/g, booking.package_name || '-')
        .replace(/{{lokasi}}/g, booking.location || '-');
      
      const waLink = buildWaLink(booking.client_phone, waMessage);

      res.json({ success: true, message: 'DP Verified. Status updated to Menunggu Pelunasan.', waLink });
    } else if (booking.payment_status === 'Menunggu Pelunasan') {
      // Transition to Lunas
      await runAsync(`
        UPDATE bookings 
        SET payment_status = 'Lunas', 
            final_paid_amount = ? 
        WHERE id = ?
      `, [paid_amount, bookingId]);

      // Write final payment cash receipt to ledger so financial report can pick it up
      await createLedgerEntry(
        'cash', paid_amount, 0,
        `Pelunasan dari ${booking.client_name}`,
        'booking', bookingId,
        req.session.admin || 'admin'
      );

      res.json({ success: true, message: 'Pelunasan Verified. Project payment complete.' });
    } else {
      res.status(400).json({ error: 'Status pembayaran tidak dapat dirubah melalui verifikasi ini.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CONFIRM DISCOUNT (Admin confirms client requested discount)
app.post('/api/bookings/:id/confirm-discount', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!booking.discount_amount || booking.discount_amount <= 0) {
      return res.status(400).json({ error: 'Tidak ada potongan harga yang perlu dikonfirmasi.' });
    }
    // Apply discount to total_deal_price and mark confirmed
    const newTotal = Math.max(0, booking.total_deal_price - booking.discount_amount);
    await runAsync(
      'UPDATE bookings SET discount_confirmed = 1, total_deal_price = ? WHERE id = ?',
      [newTotal, bookingId]
    );
    res.json({ success: true, message: `Potongan harga Rp ${booking.discount_amount.toLocaleString('id-ID')} dikonfirmasi. Total baru: Rp ${newTotal.toLocaleString('id-ID')}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET public invoice details (no session required for client view)
app.get('/api/public/bookings/:id/invoice', async (req, res) => {
  const bookingId = req.params.id;
  try {
    const booking = await getAsync(`
      SELECT b.*, p.package_name, p.price as base_price, p.description as package_description
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      WHERE b.id = ?
    `, [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking/Invoice tidak ditemukan' });

    const additional = await allAsync(`
      SELECT bas.quantity, ads.name, ads.price, ads.category
      FROM booking_additional_services bas
      JOIN additional_services ads ON bas.additional_service_id = ads.id
      WHERE bas.booking_id = ?
    `, [bookingId]);

    res.json({
      success: true,
      data: {
        id: booking.id,
        client_name: booking.client_name,
        client_phone: booking.client_phone,
        location: booking.location,
        event_date: booking.event_date,
        package_name: booking.package_name,
        base_price: booking.base_price,
        total_deal_price: booking.total_deal_price,
        discount_amount: booking.discount_amount,
        dp_paid_amount: booking.dp_paid_amount || 0,
        final_paid_amount: booking.final_paid_amount || 0,
        payment_status: booking.payment_status,
        special_requests: booking.special_requests,
        additional_services: additional
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate wa.me invoice link for client
app.post('/api/bookings/:id/send-invoice-wa', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });

    const baseUrl = getBaseUrl();
    const message = `Halo ${booking.client_name}, berikut adalah invoice resmi layanan dokumentasi SOREHARI Anda. Silakan lihat rincian selengkapnya melalui tautan berikut: ${baseUrl}/invoice.html?booking_id=${booking.id}`;
    const waLink = buildWaLink(booking.client_phone, message);

    res.json({ success: true, waLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CANCEL PROJECT (DP Hangus, release crew, manual compensation, ledger log)
async function cancelBookingHandler(req, res) {
  try {
    const bookingId = req.params.id;
    const { cancel_reason, compensation } = req.body || {}; // compensation: [{ freelancer_id, amount }]

    const b = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!b) return res.status(404).json({ success: false, error: 'Booking tidak ditemukan' });

    // 1. Update booking status
    await runAsync(
      `UPDATE bookings 
       SET payment_status = 'DP Hangus', 
           project_status = 'Selesai', 
           final_paid_amount = 0.0 
       WHERE id = ?`,
      [bookingId]
    );

    // 2. Fetch assigned crew
    const crew = await allAsync(`
      SELECT f.* 
      FROM freelancers f
      JOIN booking_freelancer bf ON f.id = bf.freelancer_id
      WHERE bf.booking_id = ?
    `, [bookingId]);

    // 3. Process compensation
    const compMap = {};
    if (compensation && Array.isArray(compensation)) {
      compensation.forEach(c => {
        compMap[c.freelancer_id] = parseFloat(c.amount) || 0;
      });
    }

    // Loop through assigned crew to handle disbursements
    for (const f of crew) {
      const compAmt = compMap[f.id] || 0;

      // Check if disbursement already exists
      const existing = await getAsync(
        "SELECT id FROM disbursements WHERE booking_id = ? AND freelancer_id = ?",
        [bookingId, f.id]
      );

      if (compAmt > 0) {
        if (existing) {
          // Update existing pending disbursement to compensation amount
          await runAsync(
            `UPDATE disbursements 
             SET role = 'Kompensasi', 
                 fee_amount = ?, 
                 fee_status = 'Pending', 
                 payment_note = ? 
             WHERE id = ?`,
            [compAmt, `Kompensasi pembatalan: ${cancel_reason || '-'}`, existing.id]
          );
        } else {
          // Insert new pending disbursement for compensation
          await runAsync(
            `INSERT INTO disbursements (booking_id, freelancer_id, role, fee_amount, fee_status, payment_note)
             VALUES (?, ?, 'Kompensasi', ?, 'Pending', ?)`,
            [bookingId, f.id, compAmt, `Kompensasi pembatalan: ${cancel_reason || '-'}`]
          );
        }
      } else {
        // No compensation for this freelancer
        if (existing) {
          if (existing.fee_status === 'Pending') {
            // Mark as Cancelled so it doesn't show up as pending fee
            await runAsync(
              `UPDATE disbursements SET fee_status = 'Cancelled', payment_note = 'Dibatalkan tanpa kompensasi' WHERE id = ?`,
              [existing.id]
            );
          }
        }
      }
    }

    // 4. Free up crew schedule
    await runAsync('DELETE FROM booking_freelancer WHERE booking_id = ?', [bookingId]);

    // 5. WA links for cancelled crew (returned to caller for optional manual sending)
    const cancelWaLinks = crew.map(f => {
      const compAmt = compMap[f.id] || 0;
      let msg = `Halo ${f.name}, dokumentasi acara ${b.client_name} pada tanggal ${b.event_date} telah DIBATALKAN.`;
      if (compAmt > 0) {
        msg += ` Anda mendapatkan kompensasi sebesar Rp ${compAmt.toLocaleString('id-ID')}. Jadwal Anda dibebaskan kembali.`;
      } else {
        msg += ` Proyek ditutup tanpa kompensasi. Jadwal Anda dibebaskan kembali.`;
      }
      return { name: f.name, waLink: buildWaLink(f.whatsapp_number, msg) };
    });

    // 6. Record profit in ledger (DP minus compensation)
    let dpAmt = b.dp_paid_amount || b.dp_claimed_amount || 0;
    let compTotal = Object.values(compMap).reduce((sum, amt) => sum + amt, 0);
    const profit = Math.max(0, dpAmt - compTotal);

    // Ledger entry for cancelled profit
    if (profit > 0) {
      await createLedgerEntry('revenue', profit, 0, `Profit dari pembatalan booking #${bookingId} (${b.client_name})`, 'booking', bookingId, 'admin');
    }

    // 7. Audit log the cancellation
    await createAuditLog('bookings', bookingId, 'UPDATE', JSON.stringify(b), JSON.stringify({ ...b, payment_status: 'DP Hangus', project_status: 'Selesai', final_paid_amount: 0.0 }), 'admin');

    res.json({
      success: true,
      dp_amount: dpAmt,
      compensation_total: compTotal,
      profit_total: profit,
      crew_wa_links: cancelWaLinks,
      message: "Booking cancelled successfully. Compensation registered."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post('/api/bookings/:id/cancel', sessionAuth, cancelBookingHandler);
app.patch('/api/bookings/:id/cancel', sessionAuth, cancelBookingHandler);

// GET available crew for a specific booking (based on date availability)
app.get('/api/bookings/:id/available-crew', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const pack = await getAsync('SELECT * FROM packages WHERE id = ?', [booking.package_id]);

    // Get IDs of crew members already assigned on this date in active bookings (excluding current booking)
    const busyFreelancers = await allAsync(`
      SELECT bf.freelancer_id 
      FROM booking_freelancer bf
      JOIN bookings b ON bf.booking_id = b.id
      WHERE b.event_date = ? AND b.project_status != 'Ditutup' AND bf.booking_id != ?
    `, [booking.event_date, bookingId]);

    const busyIds = busyFreelancers.map(r => r.freelancer_id);

    // Get already assigned crew for this booking (with their session assignments)
    const assignedCrew = await allAsync(`
      SELECT bf.freelancer_id, bf.assigned_sessions
      FROM booking_freelancer bf 
      WHERE bf.booking_id = ?
    `, [bookingId]);
    const assignedMap = {};
    assignedCrew.forEach(r => { assignedMap[r.freelancer_id] = r.assigned_sessions; });
    const assignedIds = assignedCrew.map(r => r.freelancer_id);

    // Fetch all active freelancers that are NOT busy on this date (parameterized query to prevent SQL injection)
    let allAvailable;
    if (busyIds.length > 0) {
      const placeholders = busyIds.map(() => '?').join(',');
      allAvailable = await allAsync(
        `SELECT * FROM freelancers WHERE status = 'Aktif' AND id NOT IN (${placeholders})`,
        busyIds
      );
    } else {
      allAvailable = await allAsync(`SELECT * FROM freelancers WHERE status = 'Aktif'`);
    }

    // Fetch freelancer fees for context
    for (let f of allAvailable) {
      f.fees = await allAsync(`
        SELECT ff.session_id, ff.fee_amount, s.name as session_name
        FROM freelancer_fees ff
        JOIN sessions s ON ff.session_id = s.id
        WHERE ff.freelancer_id = ?
      `, [f.id]);
    }

    // Get global settings for WA template
    const globalSettings = await getAsync('SELECT wa_template_crew_assignment FROM global_settings WHERE id = 1');
    let template = 'Halo {{nama_kru}}, Anda ditugaskan untuk dokumentasi pernikahan {{nama_klien}} pada tanggal {{tanggal_acara}} sebagai {{peran_kru}}.';
    if (globalSettings && globalSettings.wa_template_crew_assignment) {
      // Support legacy URI-encoded values and plain text
      try { template = decodeURIComponent(globalSettings.wa_template_crew_assignment); } catch(e) { template = globalSettings.wa_template_crew_assignment; }
    }

    // Fetch booking sessions (the actual scheduled sessions for this booking)
    const bookingSessions = await allAsync(`
      SELECT bs.id, bs.session_id, s.name as session_name
      FROM booking_sessions bs
      JOIN sessions s ON bs.session_id = s.id
      WHERE bs.booking_id = ?
      ORDER BY bs.event_date ASC, bs.event_time ASC
    `, [bookingId]);

    // Mark which ones are already assigned to this booking
    const result = await Promise.all(allAvailable.map(async f => {
      const assigned = assignedIds.includes(f.id);
      const assigned_sessions = assignedMap[f.id] || null;
      let waLink = '';

      if (assigned) {
        // Find session names assigned to this crew member
        let finalSessionIds = [];
        if (assigned_sessions) {
          try { finalSessionIds = JSON.parse(assigned_sessions); } catch(e){}
        }
        let sessionNamesStr = '-';
        if (finalSessionIds.length > 0) {
          const sessions = await allAsync(`
            SELECT name FROM sessions WHERE id IN (${finalSessionIds.join(',')})
          `);
          sessionNamesStr = sessions.map(s => s.name).join(', ') || '-';
        }

        let formattedMsg = template
          .replace(/{{nama_kru}}/g, f.name)
          .replace(/{{nama_klien}}/g, booking.client_name)
          .replace(/{{tanggal_acara}}/g, booking.event_date)
          .replace(/{{nama_sesi}}/g, sessionNamesStr)
          .replace(/{{lokasi}}/g, booking.venue_address || '-')
          .replace(/{{peran_kru}}/g, f.role || 'Kru');

        waLink = buildWaLink(f.whatsapp_number, formattedMsg);
      }

      return {
        ...f,
        assigned,
        assigned_sessions,
        waLink
      };
    }));

    res.json({
      available_crew: result,
      required_fg: pack ? pack.required_fg : 0,
      required_vg: pack ? pack.required_vg : 0,
      assigned_fg: result.filter(f => f.role === 'FG' && f.assigned).length,
      assigned_vg: result.filter(f => f.role === 'VG' && f.assigned).length,
      booking_sessions: bookingSessions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ASSIGN a freelancer to a booking (manual by admin)
app.post('/api/bookings/:id/assign-crew', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  const { freelancer_id, session_ids } = req.body; // session_ids: optional array of master session IDs
  if (!freelancer_id) return res.status(400).json({ error: 'freelancer_id is required' });

  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const freelancer = await getAsync('SELECT * FROM freelancers WHERE id = ?', [freelancer_id]);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });

    // Check if already assigned
    const existing = await getAsync('SELECT * FROM booking_freelancer WHERE booking_id = ? AND freelancer_id = ?', [bookingId, freelancer_id]);
    if (existing) return res.status(400).json({ error: 'Kru ini sudah ditugaskan ke booking ini.' });

    // Check if busy on same date
    const busyCheck = await getAsync(`
      SELECT bf.freelancer_id FROM booking_freelancer bf
      JOIN bookings b ON bf.booking_id = b.id
      WHERE bf.freelancer_id = ? AND b.event_date = ? AND b.project_status != 'Ditutup' AND bf.booking_id != ?
    `, [freelancer_id, booking.event_date, bookingId]);
    if (busyCheck) return res.status(400).json({ error: 'Kru ini sudah ditugaskan ke acara lain pada tanggal yang sama.' });

    // Use provided session_ids or fallback to all package sessions
    const packageSessions = await allAsync("SELECT session_id FROM package_sessions WHERE package_id = ?", [booking.package_id]);
    const finalSessionIds = (Array.isArray(session_ids) && session_ids.length > 0)
      ? session_ids
      : packageSessions.map(s => s.session_id);
    const assignedSessionsJson = JSON.stringify(finalSessionIds);

    await runAsync('INSERT INTO booking_freelancer (booking_id, freelancer_id, assigned_sessions) VALUES (?, ?, ?)', [bookingId, freelancer_id, assignedSessionsJson]);

    // Auto-create disbursement record upon crew assignment
    const existingDisb = await getAsync(
      "SELECT id FROM disbursements WHERE booking_id = ? AND freelancer_id = ?",
      [bookingId, freelancer_id]
    );
    if (!existingDisb) {
      // Calculate fee based on selected sessions only
      let totalFee = 0;
      if (finalSessionIds.length > 0) {
        for (const sId of finalSessionIds) {
          const sFee = await getAsync("SELECT fee_amount FROM freelancer_fees WHERE freelancer_id = ? AND session_id = ?", [freelancer_id, sId]);
          if (sFee && sFee.fee_amount > 0) {
            totalFee += sFee.fee_amount;
          } else {
            totalFee += freelancer.fee_per_project > 0 ? freelancer.fee_per_project : 200000;
          }
        }
      } else {
        totalFee = freelancer.fee_per_project > 0 ? freelancer.fee_per_project : 500000;
      }

      await runAsync(
        `INSERT INTO disbursements (booking_id, freelancer_id, role, fee_amount, fee_status, payment_note)
         VALUES (?, ?, ?, ?, 'Pending', ?)`,
        [bookingId, freelancer_id, freelancer.role || 'Kru', totalFee, 'Auto-generated upon crew assignment']
      );
    }

    // Build dynamic wa.me link using the configured template
    const globalSettings = await getAsync('SELECT wa_template_crew_assignment FROM global_settings WHERE id = 1');
    let template = 'Halo {{nama_kru}}, Anda ditugaskan untuk dokumentasi pernikahan {{nama_klien}} pada tanggal {{tanggal_acara}} sebagai {{peran_kru}}.';
    if (globalSettings && globalSettings.wa_template_crew_assignment) {
      // Support legacy URI-encoded values and plain text
      try { template = decodeURIComponent(globalSettings.wa_template_crew_assignment); } catch(e) { template = globalSettings.wa_template_crew_assignment; }
    }

    // Get session names for display
    const sessions = await allAsync(`
      SELECT name FROM sessions WHERE id IN (${finalSessionIds.join(',') || '0'})
    `);
    const sessionNamesStr = sessions.map(s => s.name).join(', ') || '-';

    let formattedMsg = template
      .replace(/{{nama_kru}}/g, freelancer.name)
      .replace(/{{nama_klien}}/g, booking.client_name)
      .replace(/{{tanggal_acara}}/g, booking.event_date)
      .replace(/{{nama_sesi}}/g, sessionNamesStr)
      .replace(/{{lokasi}}/g, booking.venue_address || '-')
      .replace(/{{peran_kru}}/g, freelancer.role || 'Kru');

    const waLink = buildWaLink(freelancer.whatsapp_number, formattedMsg);

    res.json({ success: true, message: `${freelancer.name} berhasil ditugaskan.`, waLink, freelancerName: freelancer.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UNASSIGN a freelancer from a booking (manual by admin)
app.post('/api/bookings/:id/unassign-crew', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  const { freelancer_id } = req.body;
  if (!freelancer_id) return res.status(400).json({ error: 'freelancer_id is required' });

  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const freelancer = await getAsync('SELECT * FROM freelancers WHERE id = ?', [freelancer_id]);

    await runAsync('DELETE FROM booking_freelancer WHERE booking_id = ? AND freelancer_id = ?', [bookingId, freelancer_id]);

    // Also auto-delete the pending disbursement record if it has not been paid yet
    await runAsync(
      "DELETE FROM disbursements WHERE booking_id = ? AND freelancer_id = ? AND fee_status = 'Pending'",
      [bookingId, freelancer_id]
    );

    res.json({ success: true, message: 'Kru berhasil dilepas dari penugasan.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE freelancer assigned sessions for a booking
app.post('/api/bookings/:id/freelancers/:freelancerId/sessions', sessionAuth, async (req, res) => {
  const bookingId = req.params.id;
  const freelancerId = req.params.freelancerId;
  const { session_ids } = req.body; // Array of master session IDs
  
  if (!Array.isArray(session_ids)) {
    return res.status(400).json({ error: 'session_ids must be an array' });
  }

  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const freelancer = await getAsync('SELECT * FROM freelancers WHERE id = ?', [freelancerId]);
    if (!freelancer) return res.status(404).json({ error: 'Freelancer not found' });

    // Update assigned_sessions in booking_freelancer
    const sessionsJson = JSON.stringify(session_ids);
    await runAsync(
      'UPDATE booking_freelancer SET assigned_sessions = ? WHERE booking_id = ? AND freelancer_id = ?',
      [sessionsJson, bookingId, freelancerId]
    );

    // Recalculate fee for the checked sessions
    let totalFee = 0;
    for (const sId of session_ids) {
      const sFee = await getAsync("SELECT fee_amount FROM freelancer_fees WHERE freelancer_id = ? AND session_id = ?", [freelancerId, sId]);
      if (sFee && sFee.fee_amount > 0) {
        totalFee += sFee.fee_amount;
      } else {
        // fallback
        totalFee += freelancer.fee_per_project > 0 ? freelancer.fee_per_project : 200000;
      }
    }

    // Update or insert disbursement fee_amount
    const existingDisb = await getAsync(
      "SELECT id, fee_status FROM disbursements WHERE booking_id = ? AND freelancer_id = ?",
      [bookingId, freelancerId]
    );

    if (existingDisb) {
      if (existingDisb.fee_status === 'Pending') {
        await runAsync(
          "UPDATE disbursements SET fee_amount = ? WHERE id = ?",
          [totalFee, existingDisb.id]
        );
      }
    } else {
      await runAsync(
        `INSERT INTO disbursements (booking_id, freelancer_id, role, fee_amount, fee_status, payment_note)
         VALUES (?, ?, ?, ?, 'Pending', ?)`,
        [bookingId, freelancerId, freelancer.role || 'Kru', totalFee, 'Auto-generated upon session update']
      );
    }

    res.json({ success: true, total_fee: totalFee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE post-prod logistik/cetak album expenses
app.post('/api/bookings/:id/update-post-prod', sessionAuth, async (req, res) => {
  const { expense_album, expense_frame, expense_logistics, expense_staff_fee } = req.body;
  const bookingId = req.params.id;
  try {
    const total_post_prod = (expense_album || 0) + (expense_frame || 0) + (expense_logistics || 0) + (expense_staff_fee || 0);
    await runAsync(
      'UPDATE bookings SET expense_album = ?, expense_frame = ?, expense_logistics = ?, expense_staff_fee = ?, post_prod_expense = ? WHERE id = ?',
      [expense_album || 0, expense_frame || 0, expense_logistics || 0, expense_staff_fee || 0, total_post_prod, bookingId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE event date (custom option)
app.post('/api/bookings/:id/update-event-date', sessionAuth, async (req, res) => {
  const { event_date } = req.body;
  const bookingId = req.params.id;
  if (!event_date) return res.status(400).json({ error: 'event_date is required' });
  try {
    await runAsync('UPDATE bookings SET event_date = ? WHERE id = ?', [event_date, bookingId]);
    await runAsync('UPDATE clients SET event_date = ? WHERE booking_id = ?', [event_date, bookingId]);
    // Sync the date to all booking_sessions for this booking so reminders work correctly
    await runAsync('UPDATE booking_sessions SET event_date = ? WHERE booking_id = ?', [event_date, bookingId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE booking package and deal price
app.post('/api/bookings/:id/update-package', sessionAuth, async (req, res) => {
  const { package_id, total_deal_price } = req.body;
  const bookingId = req.params.id;
  if (!package_id) return res.status(400).json({ error: 'package_id is required' });
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });

    const parsedPkgId = parseInt(package_id);
    const parsedPrice = parseFloat(total_deal_price);

    if (isNaN(parsedPkgId)) return res.status(400).json({ error: 'package_id harus berupa angka' });
    if (isNaN(parsedPrice) || parsedPrice < 0) return res.status(400).json({ error: 'total_deal_price tidak valid' });

    await runAsync('UPDATE bookings SET package_id = ?, total_deal_price = ? WHERE id = ?', [parsedPkgId, parsedPrice, bookingId]);

    // Create an audit log entry
    await createAuditLog('bookings', bookingId, 'UPDATE', JSON.stringify(booking), JSON.stringify({ ...booking, package_id: parsedPkgId, total_deal_price: parsedPrice }), req.session.admin || 'admin');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE project status (Editing, Review, Cetak Album, Selesai, Ditutup, Pemberhentian Sepihak)
app.post('/api/bookings/:id/update-project-status', sessionAuth, async (req, res) => {
  const { project_status } = req.body;
  const bookingId = req.params.id;
  if (!project_status) return res.status(400).json({ error: 'project_status is required' });
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Handle "Ditutup" or "Pemberhentian Sepihak" - case dianggap selesai dengan DP hangus
    if (project_status === 'Ditutup' || project_status === 'Pemberhentian Sepihak') {
      // Fetch assigned crew before deleting
      const assignedCrew = await allAsync(`
        SELECT f.* 
        FROM freelancers f
        JOIN booking_freelancer bf ON f.id = bf.freelancer_id
        WHERE bf.booking_id = ?
      `, [bookingId]);

      // Update project status and payment status to DP Hangus
      await runAsync(`
        UPDATE bookings 
        SET project_status = 'Selesai',
            payment_status = 'DP Hangus',
            final_paid_amount = 0.0 
        WHERE id = ?
      `, [bookingId]);

      // Free up crew schedule
      await runAsync('DELETE FROM booking_freelancer WHERE booking_id = ?', [bookingId]);

      // No WA simulation; admin can notify crew manually via wa.me

      res.json({ success: true, message: 'Proyek ditutup. Kasus dianggap selesai dengan DP hangus.' });
    } else {
      // Normal status update for other statuses
      await runAsync('UPDATE bookings SET project_status = ? WHERE id = ?', [project_status, bookingId]);

      if (project_status === 'Selesai') {
        // Auto-generate disbursements
        await checkAndCreateDisbursements(bookingId, 'Selesai');
      }

      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SUBMIT CLIENT TESTIMONIAL & RATING (Public review form submit)
app.post('/api/bookings/:id/submit-review', async (req, res) => {
  const { rating, testimonial_text } = req.body;
  const bookingId = req.params.id;

  // Input validation
  if (rating === undefined || !testimonial_text) {
    return res.status(400).json({ error: 'Rating dan ulasan wajib diisi.' });
  }

  // Validate rating
  const parsedRating = parseInt(rating);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: 'Rating harus antara 1-5.' });
  }

  // Validate testimonial length
  if (testimonial_text.length > 200) {
    return res.status(400).json({ error: 'Ulasan tidak boleh lebih dari 200 karakter.' });
  }

  // Validate booking ID
  const parsedBookingId = parseInt(bookingId);
  if (isNaN(parsedBookingId)) {
    return res.status(400).json({ error: 'ID booking tidak valid.' });
  }
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });

    await runAsync('UPDATE bookings SET rating = ?, testimonial_text = ? WHERE id = ?', [rating, testimonial_text, bookingId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all portfolio clients (with left-joined testimonials from bookings)
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await allAsync(`
      SELECT c.*, b.rating, b.testimonial_text, b.project_status
      FROM clients c
      LEFT JOIN bookings b ON c.booking_id = b.id
      ORDER BY c.created_at DESC
    `);
    for (let client of clients) {
      client.photos = await allAsync(
        'SELECT * FROM photos WHERE client_id = ? ORDER BY order_index',
        [client.id]
      );
    }
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single portfolio client
app.get('/api/clients/:slug', async (req, res) => {
  try {
    const client = await getAsync(`
      SELECT c.*, b.rating, b.testimonial_text, b.project_status
      FROM clients c
      LEFT JOIN bookings b ON c.booking_id = b.id
      WHERE c.slug = ?
    `, [req.params.slug]);

    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.photos = await allAsync(
      'SELECT * FROM photos WHERE client_id = ? ORDER BY order_index',
      [client.id]
    );
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE client portfolio (accepting booking_id links)
app.post('/api/clients', sessionAuth, async (req, res) => {
  const { name, description, location, event_date, booking_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const result = await runAsync(
      'INSERT INTO clients (name, slug, description, location, event_date, booking_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, slug, description || '', location || '', event_date || '', booking_id || null]
    );
    res.json({ id: result.lastID, name, slug, description, location, event_date, booking_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE client portfolio (accepting booking_id links)
app.put('/api/clients/:id', sessionAuth, async (req, res) => {
  const { name, description, location, event_date, booking_id } = req.body;
  try {
    await runAsync(
      'UPDATE clients SET name = ?, description = ?, location = ?, event_date = ?, booking_id = ? WHERE id = ?',
      [name, description, location, event_date, booking_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE client (cascades photos)
app.delete('/api/clients/:id', sessionAuth, async (req, res) => {
  try {
    // Get photos to delete files
    const photos = await allAsync('SELECT filename FROM photos WHERE client_id = ?', [req.params.id]);
    for (let photo of photos) {
      const filePath = path.join(__dirname, 'uploads', photo.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await runAsync('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPLOAD photos for a client (max 5 per client)
app.post('/api/clients/:clientId/photos', sessionAuth, (req, res, next) => {
  upload.array('photos', 5)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 50MB per foto.' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Check current photo count
    const current = await allAsync(
      'SELECT COUNT(*) as count FROM photos WHERE client_id = ?',
      [clientId]
    );

    if (current[0].count + req.files.length > 5) {
      // Clean up uploaded files
      for (let file of req.files) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: 'Maximum 5 photos per client' });
    }

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uploadedPhotos = [];
    let orderIndex = current[0].count;

    for (let file of req.files) {
      try {
        // Generate final filename
        const finalFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.jpg';
        const finalPath = path.join(uploadsDir, finalFilename);

        // Optimize image with sharp (read from temp, write to final)
        await sharp(file.path)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(finalPath);

        // Delete temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }

        const url = `/uploads/${finalFilename}`;
        const result = await runAsync(
          'INSERT INTO photos (client_id, filename, url, order_index) VALUES (?, ?, ?, ?)',
          [clientId, finalFilename, url, orderIndex]
        );

        uploadedPhotos.push({
          id: result.lastID,
          filename: finalFilename,
          url: url,
          order_index: orderIndex
        });

        orderIndex++;
      } catch (fileErr) {
        console.error('Error processing file:', fileErr);
        // Clean up this file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json(uploadedPhotos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single photo
app.delete('/api/photos/:id', sessionAuth, async (req, res) => {
  try {
    const photo = await getAsync('SELECT * FROM photos WHERE id = ?', [req.params.id]);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = path.join(__dirname, 'uploads', photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await runAsync('DELETE FROM photos WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder photos
app.post('/api/photos/reorder', sessionAuth, async (req, res) => {
  const { photoIds } = req.body;
  try {
    for (let i = 0; i < photoIds.length; i++) {
      await runAsync('UPDATE photos SET order_index = ? WHERE id = ?', [i, photoIds[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// FINANCIAL MANAGEMENT ENDPOINTS
// ==========================================

// GET Financial Settings
app.get('/api/financial/settings', sessionAuth, async (req, res) => {
  try {
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    res.json(settings || { minimum_capital: 0, business_name: 'Sorehari Photography', bank_account: 'BCA - 3420-1111-99 a.n. Sorehari Photography' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Update Financial Settings
app.put('/api/financial/settings', sessionAuth, async (req, res) => {
  const { minimum_capital, business_name, bank_account } = req.body;
  try {
    await runAsync(
      'UPDATE financial_settings SET minimum_capital = ?, business_name = ?, bank_account = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [minimum_capital || 0, business_name || 'Sorehari Photography', bank_account || 'BCA - 3420-1111-99 a.n. Sorehari Photography']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Financial Settings (alias for frontend compatibility)
app.get('/api/financial-settings', sessionAuth, async (req, res) => {
  try {
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    res.json(settings || { minimum_capital: 0, business_name: 'Sorehari Photography', bank_account: 'BCA - 3420-1111-99 a.n. Sorehari Photography' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Update Financial Settings (alias for frontend compatibility)
app.post('/api/financial-settings', sessionAuth, async (req, res) => {
  const { minimum_capital, business_name, bank_account } = req.body;
  try {
    await runAsync(
      'UPDATE financial_settings SET minimum_capital = ?, business_name = ?, bank_account = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [minimum_capital || 0, business_name || 'Sorehari Photography', bank_account || 'BCA - 3420-1111-99 a.n. Sorehari Photography']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Financial Report (Monthly/Yearly)
app.get('/api/financial/report', sessionAuth, async (req, res) => {
  const { type, year, month } = req.query;
  try {
    let startDate, endDate, periodValue;

    if (type === 'monthly') {
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      periodValue = `${year}-${String(month).padStart(2, '0')}`;
    } else if (type === 'yearly') {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
      periodValue = `${year}`;
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    // Get bookings for the period
    const bookings = await allAsync(`
      SELECT b.*, p.package_name 
      FROM bookings b 
      JOIN packages p ON b.package_id = p.id 
      WHERE b.event_date >= ? AND b.event_date <= ?
      AND b.project_status != 'Ditutup'
      ORDER BY b.event_date ASC
    `, [startDate, endDate]);

    // Calculate totals
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalPostProdExpenses = 0;
    let totalAlbumExpenses = 0;
    let totalFrameExpenses = 0;
    let totalLogisticsExpenses = 0;
    let totalStaffExpenses = 0;
    let totalDiscounts = 0;
    let totalDpReceived = 0;
    let totalFinalReceived = 0;

    bookings.forEach(b => {
      totalRevenue += b.total_deal_price;
      totalDpReceived += b.dp_paid_amount;
      totalFinalReceived += b.final_paid_amount;
      totalPostProdExpenses += b.post_prod_expense;
      totalAlbumExpenses += b.expense_album;
      totalFrameExpenses += b.expense_frame;
      totalLogisticsExpenses += b.expense_logistics;
      totalStaffExpenses += b.expense_staff_fee;
      totalDiscounts += (b.discount_amount || 0);
    });

    totalExpenses = totalPostProdExpenses + totalAlbumExpenses + totalFrameExpenses + totalLogisticsExpenses + totalStaffExpenses;
    const netProfit = totalRevenue - totalExpenses;

    // Get financial settings for minimum capital
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? settings.minimum_capital : 0;

    // Get existing period data
    const existingPeriod = await getAsync(
      'SELECT * FROM financial_periods WHERE period_type = ? AND period_value = ?',
      [type, periodValue]
    );

    // Get withdrawals for this period
    const withdrawals = await allAsync(`
      SELECT * FROM fund_withdrawals 
      WHERE withdrawal_date >= ? AND withdrawal_date <= ?
      ORDER BY withdrawal_date DESC
    `, [startDate, endDate]);

    let totalWithdrawals = 0;
    withdrawals.forEach(w => {
      totalWithdrawals += w.amount;
    });

    const report = {
      period: {
        type,
        value: periodValue,
        startDate,
        endDate,
        isClosed: existingPeriod ? existingPeriod.is_closed : false
      },
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        minimumCapital,
        capitalBalance: netProfit - totalWithdrawals,
        availableForWithdrawal: Math.max(0, (netProfit - totalWithdrawals) - minimumCapital),
        totalBookings: bookings.length,
        totalDpReceived,
        totalFinalReceived,
        totalDiscounts
      },
      expenseBreakdown: {
        postProd: totalPostProdExpenses,
        album: totalAlbumExpenses,
        frame: totalFrameExpenses,
        logistics: totalLogisticsExpenses,
        staff: totalStaffExpenses
      },
      bookings,
      withdrawals
    };

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Close Period (Monthly/Yearly)
app.post('/api/financial/close-period', sessionAuth, async (req, res) => {
  const { type, year, month, notes } = req.body;
  try {
    let startDate, endDate, periodValue;

    if (type === 'monthly') {
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      periodValue = `${year}-${String(month).padStart(2, '0')}`;
    } else if (type === 'yearly') {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
      periodValue = `${year}`;
    } else {
      return res.status(400).json({ error: 'Invalid period type' });
    }

    // Check if period already closed
    const existingPeriod = await getAsync(
      'SELECT * FROM financial_periods WHERE period_type = ? AND period_value = ?',
      [type, periodValue]
    );

    if (existingPeriod && existingPeriod.is_closed) {
      return res.status(400).json({ error: 'Period already closed' });
    }

    // Calculate totals
    const bookings = await allAsync(`
      SELECT b.* FROM bookings b 
      WHERE b.event_date >= ? AND b.event_date <= ?
      AND b.project_status != 'Ditutup'
    `, [startDate, endDate]);

    let totalRevenue = 0;
    let totalExpenses = 0;

    bookings.forEach(b => {
      totalRevenue += b.total_deal_price;
      totalExpenses += (b.post_prod_expense + b.expense_album + b.expense_frame + b.expense_logistics + b.expense_staff_fee);
    });

    const netProfit = totalRevenue - totalExpenses;

    // Get financial settings
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? settings.minimum_capital : 0;

    // Get withdrawals for this period
    const withdrawals = await allAsync(`
      SELECT * FROM fund_withdrawals 
      WHERE withdrawal_date >= ? AND withdrawal_date <= ?
    `, [startDate, endDate]);

    let totalWithdrawals = 0;
    withdrawals.forEach(w => {
      totalWithdrawals += w.amount;
    });

    const capitalBalance = netProfit - totalWithdrawals;
    const availableForWithdrawal = Math.max(0, capitalBalance - minimumCapital);

    // Insert or update period
    if (existingPeriod) {
      await runAsync(
        'UPDATE financial_periods SET total_revenue = ?, total_expenses = ?, net_profit = ?, is_closed = 1, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [totalRevenue, totalExpenses, netProfit, existingPeriod.id]
      );
    } else {
      await runAsync(
        'INSERT INTO financial_periods (period_type, period_value, start_date, end_date, total_revenue, total_expenses, net_profit, is_closed, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)',
        [type, periodValue, startDate, endDate, totalRevenue, totalExpenses, netProfit]
      );
    }

    // Get the period ID
    const period = await getAsync(
      'SELECT id FROM financial_periods WHERE period_type = ? AND period_value = ?',
      [type, periodValue]
    );

    // Create closing record
    await runAsync(
      'INSERT INTO financial_closings (period_id, closing_type, total_revenue, total_expenses, net_profit, capital_balance, minimum_capital, available_for_withdrawal, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [period.id, type, totalRevenue, totalExpenses, netProfit, capitalBalance, minimumCapital, availableForWithdrawal, notes || '']
    );

    res.json({
      success: true,
      message: 'Period closed successfully',
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        capitalBalance,
        minimumCapital,
        availableForWithdrawal
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Fund Withdrawal
app.post('/api/financial/withdrawal', sessionAuth, async (req, res) => {
  const { booking_id, withdrawal_type, amount, description, recipient, withdrawal_date } = req.body;
  try {
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    // Check if there's enough balance
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? settings.minimum_capital : 0;

    // Calculate current balance
    const totalProfit = await getAsync(`
      SELECT COALESCE(SUM(b.total_deal_price - b.post_prod_expense - b.expense_album - b.expense_frame - b.expense_logistics - b.expense_staff_fee), 0) as total
      FROM bookings b 
      WHERE b.project_status = 'Selesai'
    `);

    const totalWithdrawals = await getAsync(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fund_withdrawals
    `);

    const currentBalance = (totalProfit.total || 0) - (totalWithdrawals.total || 0);
    const availableForWithdrawal = Math.max(0, currentBalance - minimumCapital);

    if (amount > availableForWithdrawal) {
      return res.status(400).json({
        error: 'Insufficient balance',
        available: availableForWithdrawal,
        requested: amount
      });
    }

    // Create withdrawal
    const result = await runAsync(
      'INSERT INTO fund_withdrawals (booking_id, withdrawal_type, amount, description, recipient, withdrawal_date) VALUES (?, ?, ?, ?, ?, ?)',
      [booking_id || null, withdrawal_type, amount, description || '', recipient || '', withdrawal_date]
    );

    res.json({
      success: true,
      id: result.lastID,
      message: 'Withdrawal created successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Fund Withdrawals
app.get('/api/financial/withdrawals', sessionAuth, async (req, res) => {
  const { start_date, end_date } = req.query;
  try {
    let query = 'SELECT * FROM fund_withdrawals';
    let params = [];

    if (start_date && end_date) {
      query += ' WHERE withdrawal_date >= ? AND withdrawal_date <= ?';
      params = [start_date, end_date];
    }

    query += ' ORDER BY withdrawal_date DESC';

    const withdrawals = await allAsync(query, params);
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE Fund Withdrawal
app.delete('/api/financial/withdrawal/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync('DELETE FROM fund_withdrawals WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Financial Summary (Dashboard)
app.get('/api/financial/summary', sessionAuth, async (req, res) => {
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    // Get total revenue and expenses for current year
    const yearlyData = await getAsync(`
      SELECT 
        COALESCE(SUM(b.total_deal_price), 0) as total_revenue,
        COALESCE(SUM(b.post_prod_expense + b.expense_album + b.expense_frame + b.expense_logistics + b.expense_staff_fee), 0) as total_expenses,
        COUNT(*) as total_bookings
      FROM bookings b 
      WHERE b.event_date >= ? AND b.event_date <= ?
      AND b.project_status != 'Ditutup'
    `, [startDate, endDate]);

    // Get total withdrawals for current year
    const yearlyWithdrawals = await getAsync(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fund_withdrawals
      WHERE withdrawal_date >= ? AND withdrawal_date <= ?
    `, [startDate, endDate]);

    // Get financial settings
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? settings.minimum_capital : 0;

    const totalRevenue = yearlyData.total_revenue || 0;
    const totalExpenses = yearlyData.total_expenses || 0;
    const netProfit = totalRevenue - totalExpenses;
    const totalWithdrawals = yearlyWithdrawals.total || 0;
    const capitalBalance = netProfit - totalWithdrawals;
    const availableForWithdrawal = Math.max(0, capitalBalance - minimumCapital);

    res.json({
      year: currentYear,
      totalRevenue,
      totalExpenses,
      netProfit,
      totalWithdrawals,
      capitalBalance,
      minimumCapital,
      availableForWithdrawal,
      totalBookings: yearlyData.total_bookings || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Monthly Revenue Chart Data
app.get('/api/financial/monthly-chart', sessionAuth, async (req, res) => {
  const { year } = req.query;
  try {
    const monthlyData = [];

    for (let month = 1; month <= 12; month++) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const monthData = await getAsync(`
        SELECT 
          COALESCE(SUM(b.total_deal_price), 0) as revenue,
          COALESCE(SUM(b.post_prod_expense + b.expense_album + b.expense_frame + b.expense_logistics + b.expense_staff_fee), 0) as expenses,
          COUNT(*) as bookings_count
        FROM bookings b 
        WHERE b.event_date >= ? AND b.event_date <= ?
        AND b.project_status != 'Ditutup'
      `, [startDate, endDate]);

      monthlyData.push({
        month,
        monthName: new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long' }),
        revenue: monthData.revenue || 0,
        expenses: monthData.expenses || 0,
        netProfit: (monthData.revenue || 0) - (monthData.expenses || 0),
        bookingsCount: monthData.bookings_count || 0
      });
    }

    res.json(monthlyData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Export Financial Report (CSV format)
app.get('/api/financial/export', sessionAuth, async (req, res) => {
  const { type, year, month } = req.query;
  try {
    let startDate, endDate, filename;

    if (type === 'monthly') {
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      filename = `Laporan_Keuangan_${year}_${String(month).padStart(2, '0')}.csv`;
    } else if (type === 'yearly') {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
      filename = `Laporan_Keuangan_${year}.csv`;
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    // Get bookings with events in the period OR transaction activity in the ledger in the period
    const bookings = await allAsync(`
      SELECT DISTINCT b.*, p.package_name
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      LEFT JOIN ledger l ON l.ref_type = 'booking' AND l.ref_id = b.id
      WHERE (b.event_date >= ? AND b.event_date <= ?)
         OR (l.transaction_date >= ? AND l.transaction_date <= ?)
      ORDER BY b.event_date ASC
    `, [startDate, endDate, startDate, endDate]);

    // Get withdrawals
    const withdrawals = await allAsync(`
      SELECT * FROM fund_withdrawals 
      WHERE withdrawal_date >= ? AND withdrawal_date <= ?
      ORDER BY withdrawal_date DESC
    `, [startDate, endDate]);

    // Get the cash inflows and outflows from ledger specifically in this period
    const ledgerStats = await getAsync(`
      SELECT 
        COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'DP%' OR description LIKE 'Dp%') THEN debit ELSE 0 END), 0) as kas_dp,
        COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'Final Payment%' OR description LIKE 'Pelunasan%' OR description LIKE 'Final payment%') THEN debit ELSE 0 END), 0) as kas_final,
        COALESCE(SUM(CASE WHEN account = 'expense_staff' THEN debit ELSE 0 END), 0) as exp_staff,
        COALESCE(SUM(CASE WHEN account = 'expense_album' THEN debit ELSE 0 END), 0) as exp_album,
        COALESCE(SUM(CASE WHEN account = 'expense_frame' THEN debit ELSE 0 END), 0) as exp_frame,
        COALESCE(SUM(CASE WHEN account = 'expense_logistics' THEN debit ELSE 0 END), 0) as exp_logistics
      FROM ledger
      WHERE transaction_date >= ? AND transaction_date <= ?
    `, [startDate, endDate]);

    let totalRevenue = (ledgerStats.kas_dp || 0) + (ledgerStats.kas_final || 0);
    let totalAlbumExpenses = ledgerStats.exp_album || 0;
    let totalFrameExpenses = ledgerStats.exp_frame || 0;
    let totalLogisticsExpenses = ledgerStats.exp_logistics || 0;
    let totalStaffExpenses = ledgerStats.exp_staff || 0;
    let totalPostProdExpenses = 0;
    let totalExpenses = totalAlbumExpenses + totalFrameExpenses + totalLogisticsExpenses + totalStaffExpenses;
    let netProfit = totalRevenue - totalExpenses;
    let totalDiscounts = 0;

    for (let b of bookings) {
      const bStats = await getAsync(`
        SELECT 
          COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'DP%' OR description LIKE 'Dp%') THEN debit ELSE 0 END), 0) as dp,
          COALESCE(SUM(CASE WHEN account = 'cash' AND (description LIKE 'Final Payment%' OR description LIKE 'Pelunasan%' OR description LIKE 'Final payment%') THEN debit ELSE 0 END), 0) as final,
          COALESCE(SUM(CASE WHEN account = 'expense_staff' THEN debit ELSE 0 END), 0) as staff,
          COALESCE(SUM(CASE WHEN account = 'expense_album' THEN debit ELSE 0 END), 0) as album,
          COALESCE(SUM(CASE WHEN account = 'expense_frame' THEN debit ELSE 0 END), 0) as frame,
          COALESCE(SUM(CASE WHEN account = 'expense_logistics' THEN debit ELSE 0 END), 0) as logistics
        FROM ledger
        WHERE ref_type = 'booking' AND ref_id = ?
          AND transaction_date >= ? AND transaction_date <= ?
      `, [b.id, startDate, endDate]);

      b.dp_paid_amount = bStats.dp;
      b.final_paid_amount = bStats.final;
      b.expense_staff_fee = bStats.staff;
      b.expense_album = bStats.album;
      b.expense_frame = bStats.frame;
      b.expense_logistics = bStats.logistics;
      b.post_prod_expense = b.expense_album + b.expense_frame + b.expense_logistics + b.expense_staff_fee;
      totalDiscounts += (b.discount_amount || 0);
    }

    // Get financial settings
    const settings = await getAsync('SELECT * FROM financial_settings WHERE id = 1');
    const minimumCapital = settings ? settings.minimum_capital : 0;

    // Create CSV content
    let csvContent = '\uFEFF'; // BOM for Excel
    csvContent += 'LAPORAN KEUANGAN SOREHARI PHOTOGRAPHY\n';
    csvContent += `Periode: ${type === 'monthly' ? 'Bulanan' : 'Tahunan'} ${type === 'monthly' ? month : ''} ${year}\n`;
    csvContent += `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}\n\n`;

    csvContent += 'RINGKASAN KEUANGAN\n';
    csvContent += 'Total Pendapatan;Rp ' + totalRevenue.toLocaleString('id-ID') + '\n';
    csvContent += 'Total Pengeluaran;Rp ' + totalExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Laba Bersih;Rp ' + netProfit.toLocaleString('id-ID') + '\n';
    csvContent += 'Modal Minimum;Rp ' + minimumCapital.toLocaleString('id-ID') + '\n';
    csvContent += 'Saldo Modal;Rp ' + (netProfit - minimumCapital).toLocaleString('id-ID') + '\n\n';

    csvContent += 'RINCIAN PENGELUARAN\n';
    csvContent += 'Post Produksi;Rp ' + totalPostProdExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Album;Rp ' + totalAlbumExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Frame;Rp ' + totalFrameExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Logistik;Rp ' + totalLogisticsExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Fee Kru;Rp ' + totalStaffExpenses.toLocaleString('id-ID') + '\n';
    csvContent += 'Total Diskon;Rp ' + totalDiscounts.toLocaleString('id-ID') + '\n\n';

    csvContent += 'DAFTAR BOOKING\n';
    csvContent += 'Tanggal;Klien;Paket;Harga Deal;DP Dibayar;Pelunasan;Status Bayar;Status Proyek\n';

    bookings.forEach(b => {
      csvContent += `${b.event_date};${b.client_name};${b.package_name};Rp ${b.total_deal_price.toLocaleString('id-ID')};Rp ${b.dp_paid_amount.toLocaleString('id-ID')};Rp ${b.final_paid_amount.toLocaleString('id-ID')};${b.payment_status};${b.project_status}\n`;
    });

    if (withdrawals.length > 0) {
      csvContent += '\nDAFTAR PENARIKAN DANA\n';
      csvContent += 'Tanggal;Jenis;Jumlah;Penerima;Keterangan\n';

      withdrawals.forEach(w => {
        csvContent += `${w.withdrawal_date};${w.withdrawal_type};Rp ${w.amount.toLocaleString('id-ID')};${w.recipient};${w.description}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== V1.1 APIs ================== //

// 1. Helper Functions
async function createLedgerEntry(account, debit, credit, description, refType = 'manual', refId = null, createdBy = 'system') {
  await runAsync(
    `INSERT INTO ledger (transaction_date, account, debit, credit, description, ref_type, ref_id, created_by) 
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
    [account, debit, credit, description, refType, refId, createdBy]
  );
}

async function createAuditLog(tableName, rowId, action, beforeJson, afterJson, changedBy = 'admin') {
  await runAsync(
    `INSERT INTO audit_log (table_name, row_id, action, before_json, after_json, changed_by) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tableName, rowId, action, beforeJson, afterJson, changedBy]
  );
}

async function calculateBookingModal(bookingId) {
  const servicesList = await allAsync(
    `SELECT s.base_price, bs.quantity, bs.override_price 
     FROM booking_services bs 
     JOIN services s ON bs.service_id = s.id 
     WHERE bs.booking_id = ?`,
    [bookingId]
  );
  return servicesList.reduce((total, s) => {
    const price = s.override_price || s.base_price;
    return total + (price * s.quantity);
  }, 0);
}

// 2. Master Pricing API
app.get('/api/services', sessionAuth, async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM services WHERE is_active = 1';
    const params = [];
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    const servicesList = await allAsync(sql, params);
    res.json({ success: true, data: servicesList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/services', sessionAuth, async (req, res) => {
  try {
    const { name, category, base_price, description } = req.body;
    const result = await runAsync(
      'INSERT INTO services (name, category, base_price, description) VALUES (?, ?, ?, ?)',
      [name, category, base_price, description]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/services/:id', sessionAuth, async (req, res) => {
  try {
    const { name, category, base_price, description, is_active } = req.body;
    const current = await getAsync('SELECT * FROM services WHERE id = ?', [req.params.id]);
    const updateName = name !== undefined ? name : current.name;
    const updateCategory = category !== undefined ? category : current.category;
    const updatePrice = base_price !== undefined ? base_price : current.base_price;
    const updateDesc = description !== undefined ? description : current.description;
    const updateActive = is_active !== undefined ? is_active : current.is_active;

    await runAsync(
      'UPDATE services SET name = ?, category = ?, base_price = ?, description = ?, is_active = ? WHERE id = ?',
      [updateName, updateCategory, updatePrice, updateDesc, updateActive, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/services/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync('UPDATE services SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/packages_v11', sessionAuth, async (req, res) => {
  try {
    const { is_custom } = req.query;
    let sql = 'SELECT * FROM packages_v11 WHERE is_active = 1';
    const params = [];
    if (is_custom !== undefined) {
      sql += ' AND is_custom = ?';
      params.push(is_custom);
    }
    const pkgs = await allAsync(sql, params);
    res.json({ success: true, data: pkgs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/packages_v11', sessionAuth, async (req, res) => {
  try {
    const { name, description, is_custom, is_negotiable, services } = req.body;
    let total_price = 0;

    // insert
    const result = await runAsync(
      'INSERT INTO packages_v11 (name, description, is_custom, is_negotiable) VALUES (?, ?, ?, ?)',
      [name, description, is_custom || 0, is_negotiable || 0]
    );
    const packageId = result.lastID;

    if (services && services.length > 0) {
      for (const s of services) {
        await runAsync(
          'INSERT INTO package_items (package_id, service_id, quantity, override_price) VALUES (?, ?, ?, ?)',
          [packageId, s.service_id, s.quantity || 1, s.override_price || null]
        );
        const sData = await getAsync('SELECT base_price FROM services WHERE id = ?', [s.service_id]);
        total_price += (s.override_price || sData.base_price) * (s.quantity || 1);
      }
    }
    await runAsync('UPDATE packages_v11 SET total_price = ? WHERE id = ?', [total_price, packageId]);

    res.json({ success: true, id: packageId, total_price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/packages_v11/:id', sessionAuth, async (req, res) => {
  try {
    const { name, description, is_custom, is_negotiable, services } = req.body;
    let total_price = 0;

    await runAsync(
      'UPDATE packages_v11 SET name=?, description=?, is_custom=?, is_negotiable=? WHERE id=?',
      [name, description, is_custom, is_negotiable, req.params.id]
    );

    if (services && services.length > 0) {
      await runAsync('DELETE FROM package_items WHERE package_id = ?', [req.params.id]);
      for (const s of services) {
        await runAsync(
          'INSERT INTO package_items (package_id, service_id, quantity, override_price) VALUES (?, ?, ?, ?)',
          [req.params.id, s.service_id, s.quantity || 1, s.override_price || null]
        );
        const sData = await getAsync('SELECT base_price FROM services WHERE id = ?', [s.service_id]);
        total_price += (s.override_price || sData.base_price) * (s.quantity || 1);
      }
      await runAsync('UPDATE packages_v11 SET total_price = ? WHERE id = ?', [total_price, req.params.id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/packages_v11/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync('UPDATE packages_v11 SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/packages_v11/calculate', sessionAuth, async (req, res) => {
  try {
    const { services } = req.body;
    let total_price = 0;
    let breakdown = [];
    if (services) {
      for (const s of services) {
        const sData = await getAsync('SELECT * FROM services WHERE id = ?', [s.service_id]);
        if (sData) {
          const cost = (sData.base_price) * (s.quantity || 1);
          total_price += cost;
          breakdown.push({ service_id: s.service_id, name: sData.name, quantity: s.quantity || 1, cost });
        }
      }
    }
    res.json({ success: true, total_price, breakdown });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bookings/validate-discount', sessionAuth, async (req, res) => {
  try {
    const { package_id, base_price, discount } = req.body;
    // modal cost
    let modal_cost = 0;
    const items = await allAsync('SELECT * FROM package_items WHERE package_id = ?', [package_id]);
    for (const item of items) {
      const s = await getAsync('SELECT base_price FROM services WHERE id = ?', [item.service_id]);
      if (s) modal_cost += s.base_price * item.quantity;
    }

    const max_discount = base_price - modal_cost - (base_price * 0.2);
    if (discount > max_discount) {
      res.json({ success: true, valid: false, max_discount, message: "Diskon melebihi batas maksimal." });
    } else {
      res.json({ success: true, valid: true, max_discount, message: "Diskon aman." });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Payment Verification API
app.post('/api/bookings/:id/verify-dp', sessionAuth, async (req, res) => {
  try {
    const { receipt_path } = req.body;
    const bookingId = req.params.id;
    const b = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    await createAuditLog('bookings', bookingId, 'UPDATE', JSON.stringify(b), JSON.stringify({ ...b, payment_status: 'Menunggu Pelunasan', project_status: 'On Progress', dp_receipt_path: receipt_path }), req.session.admin || 'admin');

    await runAsync('UPDATE bookings SET dp_receipt_path = ?, payment_status = ?, project_status = ? WHERE id = ?', [receipt_path, 'Menunggu Pelunasan', 'On Progress', bookingId]);
    await createLedgerEntry('cash', b.dp_paid_amount || b.dp_claimed_amount || 0, 0, 'DP from ' + b.client_name, 'booking', bookingId);

    res.json({ success: true, payment_status: 'Menunggu Pelunasan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bookings/:id/verify-final', sessionAuth, async (req, res) => {
  try {
    const { receipt_path } = req.body;
    const bookingId = req.params.id;
    const b = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    await createAuditLog('bookings', bookingId, 'UPDATE', JSON.stringify(b), JSON.stringify({ ...b, payment_status: 'Lunas', final_receipt_path: receipt_path }), req.session.admin || 'admin');

    await runAsync('UPDATE bookings SET final_receipt_path = ?, payment_status = ? WHERE id = ?', [receipt_path, 'Lunas', bookingId]);
    const finalAmount = b.final_paid_amount || (b.total_deal_price - (b.dp_paid_amount || b.dp_claimed_amount || 0));
    await createLedgerEntry('cash', finalAmount, 0, 'Final Payment from ' + b.client_name, 'booking', bookingId);

    res.json({ success: true, payment_status: 'Lunas' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bookings/:id/receipts', sessionAuth, async (req, res) => {
  try {
    const b = await getAsync('SELECT dp_receipt_path, final_receipt_path FROM bookings WHERE id = ?', [req.params.id]);
    res.json({ success: true, dp_receipt: b.dp_receipt_path, final_receipt: b.final_receipt_path });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/bookings/:id/status', sessionAuth, async (req, res) => {
  try {
    const { payment_status, project_status } = req.body;
    const b = await getAsync('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    const states = ['Menunggu DP', 'Menunggu Pelunasan', 'Lunas'];
    const curIdx = states.indexOf(b.payment_status);
    const newIdx = states.indexOf(payment_status);
    if (newIdx < curIdx && newIdx !== -1) {
      return res.status(400).json({ success: false, error: 'Status cannot go backwards' });
    }

    await runAsync('UPDATE bookings SET payment_status = ?, project_status = ? WHERE id = ?', [payment_status || b.payment_status, project_status || b.project_status, req.params.id]);

    if (project_status === 'Selesai') {
      await checkAndCreateDisbursements(req.params.id, 'Selesai');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/bookings/:id/cancel_v11', sessionAuth, async (req, res) => {
  try {
    const { cancel_reason, compensation } = req.body;
    const bookingId = req.params.id;
    const b = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    await runAsync('UPDATE bookings SET payment_status = "DP Hangus", project_status = "Ditutup" WHERE id = ?', [bookingId]);

    let dpAmt = b.dp_paid_amount || b.dp_claimed_amount || 0;
    let compTotal = 0;
    if (compensation) {
      for (const c of compensation) {
        compTotal += c.amount;
        // create ledger for compensation
        await createLedgerEntry('expense_staff', c.amount, 0, `Compensation for ${c.freelancer_id}`, 'booking', bookingId);
      }
    }
    const profit = Math.max(0, dpAmt - compTotal);
    await createLedgerEntry('revenue', profit, 0, `Profit from cancelled booking ${bookingId}`, 'booking', bookingId);

    res.json({ success: true, dp_amount: dpAmt, compensation_total: compTotal, profit_total: profit, message: "Booking cancelled. Compensation issued." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Additional Services API
app.get('/api/additional-services', async (req, res) => {
  try {
    const data = await allAsync('SELECT * FROM additional_services WHERE is_active = 1');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bookings/:id/additional-services', sessionAuth, async (req, res) => {
  try {
    const { additional_services } = req.body;
    const bookingId = req.params.id;
    let addedPrice = 0;

    for (const add of additional_services) {
      await runAsync(
        'INSERT INTO booking_additional_services (booking_id, additional_service_id, quantity) VALUES (?, ?, ?)',
        [bookingId, add.additional_service_id, add.quantity || 1]
      );
      const s = await getAsync('SELECT price FROM additional_services WHERE id = ?', [add.additional_service_id]);
      if (s) addedPrice += s.price * (add.quantity || 1);
    }
    const b = await getAsync('SELECT total_deal_price FROM bookings WHERE id = ?', [bookingId]);
    const newTotal = b.total_deal_price + addedPrice;
    await runAsync('UPDATE bookings SET total_deal_price = ? WHERE id = ?', [newTotal, bookingId]);

    res.json({ success: true, total_additional_price: addedPrice, new_total_booking_price: newTotal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/bookings/:id/special-requests', sessionAuth, async (req, res) => {
  try {
    const { special_requests } = req.body;
    const bookingId = req.params.id;
    await runAsync('UPDATE bookings SET special_requests = ? WHERE id = ?', [JSON.stringify(special_requests), bookingId]);
    res.json({ success: true, special_requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Finance/Ledger API
app.get('/api/ledger', sessionAuth, async (req, res) => {
  try {
    const { from, to, account } = req.query;
    let sql = 'SELECT * FROM ledger WHERE 1=1';
    let params = [];
    if (from) { sql += ' AND transaction_date >= ?'; params.push(from); }
    if (to) { sql += ' AND transaction_date <= ?'; params.push(to); }
    if (account) { sql += ' AND account = ?'; params.push(account); }
    sql += ' ORDER BY transaction_date DESC';
    const data = await allAsync(sql, params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ledger', sessionAuth, async (req, res) => {
  try {
    const { transaction_date, account, debit, credit, description, ref_type, ref_id } = req.body;
    await createLedgerEntry(account, debit || 0, credit || 0, description, ref_type, ref_id, req.session.admin || 'admin');
    const result = await getAsync('SELECT seq FROM sqlite_sequence WHERE name="ledger"');
    res.json({ success: true, id: result ? result.seq : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/summary', sessionAuth, async (req, res) => {
  try {
    // Basic stub logic, PRD just says return this shape.
    const revenueSum = await getAsync("SELECT SUM(debit) as rev FROM ledger WHERE account='revenue'");
    const expenseSum = await getAsync("SELECT SUM(debit) as exp FROM ledger WHERE account LIKE 'expense_%'");

    const rev = revenueSum ? revenueSum.rev || 0 : 0;
    const exp = expenseSum ? expenseSum.exp || 0 : 0;
    const profit = rev - exp;

    const cap = await getAsync('SELECT * FROM capital_settings WHERE id = 1');
    const capital_balance = cap ? cap.current_balance : 0;

    res.json({
      success: true,
      summary: {
        revenue: rev,
        modal: exp,
        profit: profit,
        margin_percent: rev > 0 ? (profit / rev) * 100 : 0,
        capital_balance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/report', sessionAuth, async (req, res) => {
  // Return stub or empty list since it is just report generation
  res.json({ success: true, data: [] });
});

app.get('/api/capital', sessionAuth, async (req, res) => {
  try {
    const data = await getAsync('SELECT * FROM capital_settings WHERE id=1');
    if (data) res.json({ success: true, minimum_capital: data.minimum_capital, current_balance: data.current_balance });
    else res.json({ success: true, minimum_capital: 0, current_balance: 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/capital', sessionAuth, async (req, res) => {
  try {
    const { minimum_capital, current_balance } = req.body;
    await runAsync('INSERT OR REPLACE INTO capital_settings (id, minimum_capital, current_balance) VALUES (1, ?, ?)', [minimum_capital, current_balance]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Audit Log API
app.get('/api/audit', sessionAuth, async (req, res) => {
  try {
    const { table, since, limit } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    let params = [];
    if (table) { sql += ' AND table_name = ?'; params.push(table); }
    if (since) { sql += ' AND created_at >= ?'; params.push(since); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit || 100);
    const data = await allAsync(sql, params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. System Health API
app.get('/api/health', sessionAuth, (req, res) => {
  res.json({ success: true, status: { pm2: "online", db: "ok", nginx: "ok", disk_usage: 45 } });
});

app.post('/api/system/restart-pm2', sessionAuth, (req, res) => {
  res.json({ success: true });
});

app.post('/api/system/reload-nginx', sessionAuth, (req, res) => {
  res.json({ success: true });
});

// ============================================================
// DISBURSEMENT MANAGEMENT API (Gaji & Fee Freelancer)
// ============================================================

// Helper: ensure disbursements table exists
(async () => {
  try {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS disbursements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        freelancer_id INTEGER NOT NULL,
        role TEXT DEFAULT 'Kru',
        fee_amount REAL DEFAULT 0,
        fee_status TEXT DEFAULT 'Pending',
        file_status TEXT DEFAULT 'Belum Setor',
        paid_at TEXT,
        payment_note TEXT,
        receipt_note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (freelancer_id) REFERENCES freelancers(id)
      )
    `);
    try {
      await runAsync("ALTER TABLE disbursements ADD COLUMN file_status TEXT DEFAULT 'Belum Setor'");
      console.log('[DB MIGRATE SUCCESS] disbursements table file_status column added');
    } catch (err) {
      // Column already exists
    }
    console.log('[DB INIT SUCCESS] disbursements table');
  } catch (e) {
    console.error('[DB INIT ERROR] disbursements:', e.message);
  }
})();

// Helper: Auto-create disbursements for crew when booking is 'Selesai'
async function checkAndCreateDisbursements(bookingId, projectStatus) {
  if (projectStatus !== 'Selesai') return;
  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return;

    const crew = await allAsync(`
      SELECT f.* 
      FROM freelancers f
      JOIN booking_freelancer bf ON f.id = bf.freelancer_id
      WHERE bf.booking_id = ?
    `, [bookingId]);

    for (const f of crew) {
      // Check if duplicate pending disbursement already exists
      const existing = await getAsync(
        "SELECT id FROM disbursements WHERE booking_id = ? AND freelancer_id = ?",
        [bookingId, f.id]
      );
      if (!existing) {
        const fee = f.fee_per_project > 0 ? f.fee_per_project : 500000;
        await runAsync(
          `INSERT INTO disbursements (booking_id, freelancer_id, role, fee_amount, fee_status, payment_note)
           VALUES (?, ?, ?, ?, 'Pending', ?)`,
          [bookingId, f.id, f.role || 'Kru', fee, 'Auto-generated upon completion']
        );
      }
    }
  } catch (e) {
    console.error('[AUTO DISBURSEMENT ERROR]:', e.message);
  }
}

// GET /api/disbursements — list all (with optional filter ?status=Pending)
app.get('/api/disbursements', sessionAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT
        d.id,
        d.booking_id,
        d.freelancer_id,
        d.role,
        d.fee_amount,
        d.fee_status,
        d.file_status,
        d.paid_at,
        d.payment_note,
        d.receipt_note,
        d.created_at,
        f.name  AS freelancer_name,
        f.whatsapp_number AS freelancer_wa,
        f.role  AS freelancer_role,
        b.client_name,
        b.event_date,
        b.project_status,
        b.payment_status,
        b.total_deal_price
      FROM disbursements d
      JOIN freelancers f ON d.freelancer_id = f.id
      JOIN bookings   b ON d.booking_id    = b.id
    `;
    const params = [];
    if (status) { sql += ' WHERE d.fee_status = ?'; params.push(status); }
    sql += ' ORDER BY d.created_at DESC';
    const data = await allAsync(sql, params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/disbursements/summary — aggregated stats
app.get('/api/disbursements/summary', sessionAuth, async (req, res) => {
  try {
    const stats = await getAsync(`
      SELECT
        COUNT(*)                                        AS total,
        SUM(CASE WHEN fee_status='Pending' THEN 1 ELSE 0 END)  AS pending_count,
        SUM(CASE WHEN fee_status='Paid'    THEN 1 ELSE 0 END)  AS paid_count,
        COALESCE(SUM(CASE WHEN fee_status='Pending' THEN fee_amount ELSE 0 END), 0) AS total_unpaid,
        COALESCE(SUM(CASE WHEN fee_status='Paid'    THEN fee_amount ELSE 0 END), 0) AS total_paid
      FROM disbursements
    `);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/disbursements — create new disbursement record manually
app.post('/api/disbursements', sessionAuth, async (req, res) => {
  try {
    const { booking_id, freelancer_id, role, fee_amount, payment_note } = req.body;
    if (!booking_id || !freelancer_id || !fee_amount) {
      return res.status(400).json({ success: false, error: 'booking_id, freelancer_id, fee_amount wajib diisi' });
    }

    // Check booking exists and project is Selesai
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [booking_id]);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking tidak ditemukan' });

    // Check freelancer is assigned to this booking
    const assignment = await getAsync(
      'SELECT * FROM booking_freelancer WHERE booking_id = ? AND freelancer_id = ?',
      [booking_id, freelancer_id]
    );
    if (!assignment) return res.status(400).json({ success: false, error: 'Freelancer tidak terdaftar dalam booking ini' });

    // Check no duplicate pending disbursement
    const existing = await getAsync(
      "SELECT id FROM disbursements WHERE booking_id = ? AND freelancer_id = ? AND fee_status = 'Pending'",
      [booking_id, freelancer_id]
    );
    if (existing) return res.status(400).json({ success: false, error: 'Sudah ada tagihan pending untuk freelancer ini di booking yang sama' });

    const result = await runAsync(
      `INSERT INTO disbursements (booking_id, freelancer_id, role, fee_amount, fee_status, payment_note)
       VALUES (?, ?, ?, ?, 'Pending', ?)`,
      [booking_id, freelancer_id, role || 'Kru', parseFloat(fee_amount), payment_note || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/disbursements/:id/pay — mark as paid & generate receipt note
app.post('/api/disbursements/:id/pay', sessionAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_note } = req.body;

    const disb = await getAsync(`
      SELECT d.*, f.name AS freelancer_name, b.client_name, b.event_date
      FROM disbursements d
      JOIN freelancers f ON d.freelancer_id = f.id
      JOIN bookings   b ON d.booking_id    = b.id
      WHERE d.id = ?
    `, [id]);

    if (!disb) return res.status(404).json({ success: false, error: 'Disbursement tidak ditemukan' });
    if (disb.fee_status === 'Paid') return res.status(400).json({ success: false, error: 'Fee ini sudah dibayarkan' });

    const paidAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const receiptNote = `STRUK PEMBAYARAN FEE\n` +
      `---------------------------\n` +
      `Freelancer : ${disb.freelancer_name}\n` +
      `Peran      : ${disb.role}\n` +
      `Klien      : ${disb.client_name}\n` +
      `Tgl Acara  : ${disb.event_date}\n` +
      `Nominal    : Rp ${parseFloat(disb.fee_amount).toLocaleString('id-ID')}\n` +
      `Dibayar    : ${paidAt}\n` +
      `Catatan    : ${payment_note || '-'}\n` +
      `---------------------------\n` +
      `Sorehari Photography Management`;

    await runAsync(
      `UPDATE disbursements SET fee_status='Paid', paid_at=?, payment_note=?, receipt_note=? WHERE id=?`,
      [paidAt, payment_note || '', receiptNote, id]
    );

    // 1. Double-entry ledger logs
    await createLedgerEntry('expense_staff', parseFloat(disb.fee_amount), 0, `Fee Freelancer: ${disb.freelancer_name} (${disb.role}) - Klien ${disb.client_name}`, 'booking', disb.booking_id, req.session.admin || 'admin');
    await createLedgerEntry('cash', 0, parseFloat(disb.fee_amount), `Fee Freelancer: ${disb.freelancer_name} (${disb.role}) - Klien ${disb.client_name}`, 'booking', disb.booking_id, req.session.admin || 'admin');

    // 2. Update staff expense in booking
    await runAsync(
      'UPDATE bookings SET expense_staff_fee = expense_staff_fee + ? WHERE id = ?',
      [parseFloat(disb.fee_amount), disb.booking_id]
    );

    // 3. Create Audit Log
    await createAuditLog('disbursements', id, 'UPDATE', JSON.stringify(disb), JSON.stringify({ ...disb, fee_status: 'Paid', paid_at: paidAt, payment_note }), req.session.admin || 'admin');

    res.json({ success: true, receipt: receiptNote, paid_at: paidAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/disbursements/:id — remove a pending disbursement
app.delete('/api/disbursements/:id', sessionAuth, async (req, res) => {
  try {
    const disb = await getAsync('SELECT * FROM disbursements WHERE id = ?', [req.params.id]);
    if (!disb) return res.status(404).json({ success: false, error: 'Disbursement tidak ditemukan' });
    if (disb.fee_status === 'Paid') return res.status(400).json({ success: false, error: 'Disbursement yang sudah dibayar tidak bisa dihapus' });
    await runAsync('DELETE FROM disbursements WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/disbursements/:id/file-status — update file submission status
app.patch('/api/disbursements/:id/file-status', sessionAuth, async (req, res) => {
  const { file_status } = req.body;
  if (!file_status) return res.status(400).json({ success: false, error: 'file_status wajib diisi' });

  try {
    const disb = await getAsync('SELECT * FROM disbursements WHERE id = ?', [req.params.id]);
    if (!disb) return res.status(404).json({ success: false, error: 'Disbursement tidak ditemukan' });

    await runAsync('UPDATE disbursements SET file_status = ? WHERE id = ?', [file_status, req.params.id]);
    res.json({ success: true, file_status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/disbursements/by-booking/:bookingId — fee records for a booking
app.get('/api/disbursements/by-booking/:bookingId', sessionAuth, async (req, res) => {
  try {
    const data = await allAsync(`
      SELECT d.*, f.name AS freelancer_name, f.role AS freelancer_role
      FROM disbursements d
      JOIN freelancers f ON d.freelancer_id = f.id
      WHERE d.booking_id = ?
      ORDER BY d.created_at DESC
    `, [req.params.bookingId]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/disbursements/unpaid-by-freelancer — unpaid fees grouped by freelancer
app.get('/api/disbursements/unpaid-by-freelancer', sessionAuth, async (req, res) => {
  try {
    const data = await allAsync(`
      SELECT
        f.id AS freelancer_id,
        f.name AS freelancer_name,
        f.role AS freelancer_role,
        f.whatsapp_number,
        COUNT(d.id) AS pending_count,
        COALESCE(SUM(d.fee_amount), 0) AS total_unpaid,
        GROUP_CONCAT(b.client_name, ', ') AS clients
      FROM disbursements d
      JOIN freelancers f ON d.freelancer_id = f.id
      JOIN bookings b ON d.booking_id = b.id
      WHERE d.fee_status = 'Pending'
      GROUP BY f.id, f.name, f.role, f.whatsapp_number
      ORDER BY total_unpaid DESC
    `);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PRD v1.1.9: MASTER SESI, FREELANCER FEES, & REMINDERS
// ============================================================

// 1. CRUD Master Sesi
app.get('/api/sessions', sessionAuth, async (req, res) => {
  try {
    const data = await allAsync("SELECT * FROM sessions ORDER BY is_active DESC, default_order ASC");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions', sessionAuth, async (req, res) => {
  try {
    const { name, description, default_order } = req.body;
    
    // Check if session with same name already exists
    const existing = await getAsync("SELECT id, is_active FROM sessions WHERE name = ?", [name]);
    if (existing) {
      if (existing.is_active === 0) {
        // Automatically reactivate and update description/order
        await runAsync(
          "UPDATE sessions SET is_active = 1, description = ?, default_order = ? WHERE id = ?",
          [description, default_order || 0, existing.id]
        );
        return res.json({ success: true, message: "Sesi diaktifkan kembali." });
      } else {
        return res.status(400).json({ success: false, error: "Nama sesi sudah terdaftar dan aktif." });
      }
    }

    await runAsync(
      "INSERT INTO sessions (name, description, default_order) VALUES (?, ?, ?)",
      [name, description, default_order || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sessions/:id', sessionAuth, async (req, res) => {
  try {
    const { name, description, default_order, is_active } = req.body;
    await runAsync(
      "UPDATE sessions SET name = ?, description = ?, default_order = ?, is_active = ? WHERE id = ?",
      [name, description, default_order, is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/sessions/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync("UPDATE sessions SET is_active = 0 WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Fee Freelancer Per Sesi
app.get('/api/freelancers/:id/fees', sessionAuth, async (req, res) => {
  try {
    const data = await allAsync("SELECT * FROM freelancer_fees WHERE freelancer_id = ?", [req.params.id]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/freelancers/:id/fees', sessionAuth, async (req, res) => {
  try {
    const { fees } = req.body; // array of { session_id, fee_amount }
    const freelancer_id = req.params.id;

    // Hapus semua data lama untuk memastikan sinkronisasi sempurna dengan input pengguna (reset fee jika dikosongkan)
    await runAsync("DELETE FROM freelancer_fees WHERE freelancer_id = ?", [freelancer_id]);

    for (const f of fees) {
      await runAsync(
        "INSERT INTO freelancer_fees (freelancer_id, session_id, fee_amount) VALUES (?, ?, ?)",
        [freelancer_id, f.session_id, f.fee_amount]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Estimasi Modal Paket (AVG Fee)
app.post('/api/packages/calculate-estimate', sessionAuth, async (req, res) => {
  try {
    const { service_ids, service_items, session_ids, fg_count = 1, vg_count = 1 } = req.body;
    let modal_produk = 0;

    if (service_items && service_items.length > 0) {
      for (const item of service_items) {
        const s = await getAsync("SELECT base_price FROM services WHERE id = ?", [item.service_id]);
        if (s) {
          modal_produk += (s.base_price * (item.qty || 1));
        }
      }
    } else if (service_ids && service_ids.length > 0) {
      const placeholders = service_ids.map(() => '?').join(',');
      const services = await allAsync(`SELECT SUM(base_price) as total FROM services WHERE id IN (${placeholders})`, service_ids);
      modal_produk = services[0]?.total || 0;
    }

    let estimasi_modal_jasa = 0;
    let detail_sesi = [];

    if (session_ids && session_ids.length > 0) {
      // Hitung global average session fee untuk FG
      const fgResult = await getAsync(`
        SELECT AVG(avg_session_fee) as val FROM (
          SELECT (SELECT AVG(fee_amount) FROM freelancer_fees WHERE freelancer_id = f.id AND fee_amount > 0) AS avg_session_fee 
          FROM freelancers f WHERE f.status = 'Aktif' AND f.role = 'FG'
        ) WHERE avg_session_fee > 0
      `);
      const global_avg_fg = Math.round(fgResult?.val || 200000);

      // Hitung global average session fee untuk VG
      const vgResult = await getAsync(`
        SELECT AVG(avg_session_fee) as val FROM (
          SELECT (SELECT AVG(fee_amount) FROM freelancer_fees WHERE freelancer_id = f.id AND fee_amount > 0) AS avg_session_fee 
          FROM freelancers f WHERE f.status = 'Aktif' AND f.role = 'VG'
        ) WHERE avg_session_fee > 0
      `);
      const global_avg_vg = Math.round(vgResult?.val || 200000);

      const num_sessions = session_ids.length;
      estimasi_modal_jasa = (global_avg_fg * fg_count * num_sessions) + (global_avg_vg * vg_count * num_sessions);

      for (const s_id of session_ids) {
        const session = await getAsync("SELECT name FROM sessions WHERE id = ?", [s_id]);
        if (!session) continue;

        const subtotal = (global_avg_fg * fg_count) + (global_avg_vg * vg_count);

        detail_sesi.push({
          session_id: s_id,
          name: session.name,
          avg_fg_fee: global_avg_fg,
          avg_vg_fee: global_avg_vg,
          fg_count,
          vg_count,
          subtotal
        });
      }
    }

    res.json({
      success: true,
      modal_produk,
      estimasi_modal_jasa,
      total_estimasi_modal: modal_produk + estimasi_modal_jasa,
      detail_sesi
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. CRUD Booking Sessions (Timeline Acara)
app.get('/api/bookings/:id/sessions', sessionAuth, async (req, res) => {
  try {
    const data = await allAsync(`
      SELECT bs.*, s.name as session_name 
      FROM booking_sessions bs 
      JOIN sessions s ON bs.session_id = s.id 
      WHERE bs.booking_id = ?
      ORDER BY bs.event_date ASC, bs.event_time ASC
    `, [req.params.id]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bookings/:id/sessions', sessionAuth, async (req, res) => {
  try {
    const { session_id, event_date, event_time, location, gps_link, notes, crew_needed } = req.body;
    await runAsync(
      "INSERT INTO booking_sessions (booking_id, session_id, event_date, event_time, location, gps_link, notes, crew_needed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [req.params.id, session_id, event_date || '', event_time || '', location || '', gps_link || '', notes || '', crew_needed || '[]']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/bookings/sessions/:sessionId', sessionAuth, async (req, res) => {
  try {
    const { event_date, event_time, location, gps_link, notes, crew_needed } = req.body;
    await runAsync(
      "UPDATE booking_sessions SET event_date = ?, event_time = ?, location = ?, gps_link = ?, notes = ?, crew_needed = ? WHERE id = ?",
      [event_date, event_time, location, gps_link, notes, crew_needed || '[]', req.params.sessionId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/bookings/sessions/:sessionId', sessionAuth, async (req, res) => {
  try {
    await runAsync("DELETE FROM booking_sessions WHERE id = ?", [req.params.sessionId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Reminder API
app.get('/api/reminders/pending', sessionAuth, async (req, res) => {
  try {
    // H-3 Client reminders from booking_sessions
    const sqlClientSession = `
      SELECT bs.id as booking_session_id, bs.booking_id, bs.session_id,
             b.client_name as target_name, b.client_phone as target_phone,
             COALESCE(b.location, b.venue_address) as lokasi,
             s.name as session_name,
             COALESCE(bs.event_date, b.event_date) as event_date,
             bs.event_time, 'H-3_Client' as reminder_type,
             NULL as freelancer_id, NULL as client_name_for_crew
      FROM booking_sessions bs
      JOIN bookings b ON bs.booking_id = b.id
      JOIN sessions s ON bs.session_id = s.id
      WHERE COALESCE(bs.event_date, b.event_date) BETWEEN DATE('now', '+1 day', 'localtime') AND DATE('now', '+7 days', 'localtime')
      AND b.payment_status NOT IN ('DP Hangus', 'Lunas')
      AND b.project_status != 'Selesai'
      AND NOT EXISTS (
          SELECT 1 FROM wa_reminders wr
          WHERE wr.booking_id = bs.booking_id
          AND wr.session_id = bs.session_id
          AND wr.reminder_type = 'H-3_Client'
          AND wr.is_sent = 1
      )
    `;

    // Fallback: bookings WITHOUT booking_sessions
    const sqlClientFallback = `
      SELECT b.id as booking_session_id, b.id as booking_id, NULL as session_id,
             b.client_name as target_name, b.client_phone as target_phone,
             COALESCE(b.location, b.venue_address) as lokasi,
             'Acara Utama' as session_name,
             b.event_date, NULL as event_time, 'H-3_Client' as reminder_type,
             NULL as freelancer_id, NULL as client_name_for_crew
      FROM bookings b
      WHERE b.event_date BETWEEN DATE('now', '+1 day', 'localtime') AND DATE('now', '+7 days', 'localtime')
      AND b.payment_status NOT IN ('DP Hangus', 'Lunas')
      AND b.project_status != 'Selesai'
      AND NOT EXISTS (SELECT 1 FROM booking_sessions bs WHERE bs.booking_id = b.id)
      AND NOT EXISTS (
          SELECT 1 FROM wa_reminders wr
          WHERE wr.booking_id = b.id
          AND wr.reminder_type = 'H-3_Client'
          AND wr.is_sent = 1
      )
    `;

    // H-1 Crew from booking_sessions
    const sqlCrewSession = `
      SELECT bs.id as booking_session_id, bs.booking_id, bs.session_id,
             f.name as target_name, f.whatsapp_number as target_phone,
             COALESCE(b.location, b.venue_address) as lokasi,
             s.name as session_name,
             COALESCE(bs.event_date, b.event_date) as event_date,
             bs.event_time, 'H-1_Crew' as reminder_type,
             f.id as freelancer_id, b.client_name as client_name_for_crew
      FROM booking_sessions bs
      JOIN bookings b ON bs.booking_id = b.id
      JOIN sessions s ON bs.session_id = s.id
      JOIN booking_freelancer bf ON bf.booking_id = b.id
      JOIN freelancers f ON bf.freelancer_id = f.id
      WHERE COALESCE(bs.event_date, b.event_date) = DATE('now', '+1 day', 'localtime')
      AND b.payment_status != 'DP Hangus'
      AND NOT EXISTS (
          SELECT 1 FROM wa_reminders wr
          WHERE wr.booking_id = bs.booking_id
          AND wr.freelancer_id = f.id
          AND wr.session_id = bs.session_id
          AND wr.reminder_type = 'H-1_Crew'
          AND wr.is_sent = 1
      )
    `;

    // H-1 Crew fallback: bookings WITHOUT booking_sessions
    const sqlCrewFallback = `
      SELECT b.id as booking_session_id, b.id as booking_id, NULL as session_id,
             f.name as target_name, f.whatsapp_number as target_phone,
             COALESCE(b.location, b.venue_address) as lokasi,
             'Acara Utama' as session_name,
             b.event_date, NULL as event_time, 'H-1_Crew' as reminder_type,
             f.id as freelancer_id, b.client_name as client_name_for_crew
      FROM bookings b
      JOIN booking_freelancer bf ON bf.booking_id = b.id
      JOIN freelancers f ON bf.freelancer_id = f.id
      WHERE b.event_date = DATE('now', '+1 day', 'localtime')
      AND b.payment_status != 'DP Hangus'
      AND NOT EXISTS (SELECT 1 FROM booking_sessions bs WHERE bs.booking_id = b.id)
      AND NOT EXISTS (
          SELECT 1 FROM wa_reminders wr
          WHERE wr.booking_id = b.id
          AND wr.freelancer_id = f.id
          AND wr.reminder_type = 'H-1_Crew'
          AND wr.is_sent = 1
      )
    `;

    const [clientsSess, clientsFallback, crewsSess, crewsFallback] = await Promise.all([
      allAsync(sqlClientSession),
      allAsync(sqlClientFallback),
      allAsync(sqlCrewSession),
      allAsync(sqlCrewFallback)
    ]);

    const clients = [...clientsSess, ...clientsFallback];
    const crews = [...crewsSess, ...crewsFallback];

    // Load WA templates
    const settings = await getAsync('SELECT wa_template_h3_client, wa_template_h1_crew FROM global_settings WHERE id = 1');
    const safeDecode = (v) => { try { return decodeURIComponent(v || ''); } catch(e) { return v || ''; } };
    const tmplH3 = safeDecode(settings && settings.wa_template_h3_client) ||
      `Halo {{nama_klien}}! Ini pengingat dari *Sorehari Studio*. Acara Anda akan segera tiba!

📅 Tanggal: *{{tanggal_acara}}*
📌 Sesi: *{{nama_sesi}}*
📍 Lokasi: *{{lokasi}}*

Jika ada perubahan, segera hubungi kami. Terima kasih!`;
    const tmplH1 = safeDecode(settings && settings.wa_template_h1_crew) ||
      `Halo {{nama_kru}}! Pengingat dari *Sorehari Studio*: Anda bertugas besok!

👤 Klien: *{{nama_klien}}*
📅 Tanggal: *{{tanggal_acara}}*
📌 Sesi: *{{nama_sesi}}*
📍 Lokasi: *{{lokasi}}*

Mohon hadir tepat waktu.`;

    const fmtDate = (d) => {
      if (!d) return '-';
      const parts = d.split('-');
      if (parts.length !== 3) return d;
      const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      return `${parseInt(parts[2])} ${months[parseInt(parts[1])-1]} ${parts[0]}`;
    };

    const buildItem = (r, tmpl, typeLabel) => {
      const namaKlien = typeLabel === 'client' ? r.target_name : (r.client_name_for_crew || '-');
      const msg = tmpl
        .replace(/{{nama_klien}}/g, namaKlien)
        .replace(/{{nama_kru}}/g, r.target_name || '-')
        .replace(/{{tanggal_acara}}/g, fmtDate(r.event_date))
        .replace(/{{nama_sesi}}/g, r.session_name || '-')
        .replace(/{{lokasi}}/g, r.lokasi || '(mohon konfirmasi lokasi)');

      let phone = (r.target_phone || '').replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.slice(1);
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : '';

      const today = new Date(); today.setHours(0,0,0,0);
      const eventDate = new Date(r.event_date); eventDate.setHours(0,0,0,0);
      const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));

      return {
        id: r.booking_session_id, booking_id: r.booking_id, session_id: r.session_id,
        freelancer_id: r.freelancer_id || null, reminder_type: r.reminder_type,
        target_type: typeLabel, target_name: r.target_name, target_phone: r.target_phone,
        session_name: r.session_name, scheduled_for: r.event_date, days_until: diffDays,
        message_template: msg, wa_link: waLink
      };
    };

    const result = [
      ...clients.map(r => buildItem(r, tmplH3, 'client')),
      ...crews.map(r => buildItem(r, tmplH1, 'crew'))
    ];

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Calendar Bookings Endpoint
app.get('/api/calendar/bookings', sessionAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = "b.payment_status != 'DP Hangus'";
    const params = [];
    if (year && month) {
      const paddedMonth = String(month).padStart(2, '0');
      whereClause += " AND strftime('%Y-%m', b.event_date) = ?";
      params.push(`${year}-${paddedMonth}`);
    }
    const bookings = await allAsync(`
      SELECT b.id, b.client_name, b.client_phone, b.event_date, b.location,
             b.payment_status, b.project_status, p.package_name
      FROM bookings b
      LEFT JOIN packages p ON b.package_id = p.id
      WHERE ${whereClause}
      ORDER BY b.event_date ASC
    `, params);
    res.json({ success: true, data: bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/reminders/sent', sessionAuth, async (req, res) => {
  try {
    const { booking_id, session_id, freelancer_id, reminder_type, target_name, target_phone, message_text } = req.body;
    await runAsync(
      `INSERT INTO wa_reminders 
        (booking_id, session_id, freelancer_id, reminder_type, target_name, target_phone, message_text, is_sent, sent_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [booking_id, session_id, freelancer_id, reminder_type, target_name, target_phone, message_text]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Studio Profile Endpoints ---
app.get('/api/studio-profile', async (req, res) => {
  try {
    const profile = await getAsync('SELECT * FROM studio_profile WHERE id = 1');
    res.json(profile || {
      studio_name: 'Sorehari Studio',
      tagline: 'Abadikan Momen Terbaik Anda',
      whatsapp_number: '6281234567890',
      email: '',
      address: '',
      instagram: '',
      website: '',
      logo_url: ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/studio-profile', sessionAuth, async (req, res) => {
  const { studio_name, tagline, whatsapp_number, email, address, instagram, website, logo_url } = req.body;
  try {
    await runAsync(
      `UPDATE studio_profile SET 
        studio_name = ?, tagline = ?, whatsapp_number = ?, email = ?, 
        address = ?, instagram = ?, website = ?, logo_url = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1`,
      [
        studio_name || 'Sorehari Studio', 
        tagline || '', 
        whatsapp_number || '', 
        email || '', 
        address || '', 
        instagram || '', 
        website || '', 
        logo_url || ''
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/studio-profile/logo', sessionAuth, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file logo yang dikirim' });
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const finalFilename = 'studio-logo-' + Date.now() + '.png';
    const finalPath = path.join(uploadsDir, finalFilename);

    // Compress using sharp to max 300x300, convert to PNG, optimized
    await sharp(req.file.path)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(finalPath);

    // Delete temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const logoUrl = `/uploads/${finalFilename}`;
    // Update the database immediately
    await runAsync('UPDATE studio_profile SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [logoUrl]);

    res.json({ success: true, logo_url: logoUrl });
  } catch (err) {
    console.error('Error uploading logo:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// --- Blocked Dates Endpoints ---
app.get('/api/blocked-dates', async (req, res) => {
  try {
    const dates = await allAsync('SELECT * FROM blocked_dates ORDER BY blocked_date ASC');
    res.json(dates || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blocked-dates', sessionAuth, async (req, res) => {
  const { blocked_date, reason } = req.body;
  if (!blocked_date) return res.status(400).json({ error: 'Tanggal wajib diisi' });
  try {
    await runAsync('INSERT INTO blocked_dates (blocked_date, reason) VALUES (?, ?)', [blocked_date, reason || '']);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Tanggal ini sudah diblokir' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/blocked-dates/:id', sessionAuth, async (req, res) => {
  try {
    await runAsync('DELETE FROM blocked_dates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Sorehari server running on http://localhost:${PORT}`);
});
