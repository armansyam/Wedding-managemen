const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');

// === PUBLIC BOOKING (by token) ===
// GET public packages (for client to choose) — MUST be before /:token
router.get('/public/packages/all', (req, res) => {
  const packages = db.prepare(`
    SELECT p.id, p.name, p.description, p.price,
           GROUP_CONCAT(s.id) AS session_ids,
           GROUP_CONCAT(s.name) AS session_names
    FROM packages p
    LEFT JOIN package_sessions ps ON ps.package_id = p.id
    LEFT JOIN sessions s ON s.id = ps.session_id
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY p.price ASC
  `).all();
  res.json(packages);
});

// GET public booking by token (client view) — MUST be before /:id routes
router.get('/public/:token', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.name AS client_name, c.partner_name, c.phone AS client_phone,
           p.name AS package_name, p.description AS package_description
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    LEFT JOIN packages p ON b.package_id = p.id
    WHERE b.booking_token = ?
  `).get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Booking not found', expired: true });

  // Token expiry: 3 days from creation
  const created = new Date(booking.created_at);
  const now = new Date();
  const daysSince = (now - created) / (1000 * 60 * 60 * 24);
  if (daysSince > 3 && !booking.package_id) {
    return res.status(410).json({ error: 'Link booking sudah kedaluwarsa (berlaku maks 3 hari)', expired: true });
  }

  // Already completed (package selected + DP uploaded + verified) → show done state
  if (booking.package_id && ['confirmed', 'in_progress', 'event_day', 'completed'].includes(booking.status)) {
    return res.json({ ...booking, _done: true });
  }

  // If pending_verification, show waiting state
  if (booking.status === 'pending_verification') {
    return res.json({ ...booking, _waiting_verification: true });
  }

  // If proposal_sent (client hasn't submitted yet) - show package selection
  if (booking.status === 'proposal_sent') {
    // Continue to show packages
  }

  const sessions = db.prepare(`
    SELECT bs.*, s.name AS session_name, s.default_order
    FROM booking_sessions bs
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ?
    ORDER BY s.default_order
  `).all(booking.id);

  const payments = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_date DESC').all(booking.id);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  res.json({
    ...booking,
    sessions,
    payments,
    total_paid: totalPaid,
    remaining: (booking.package_price || 0) - totalPaid,
  });
});

// POST client selects package from public link
router.post('/public/:token/select-package', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_token = ?').get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { package_id } = req.body;
  if (!package_id) return res.status(400).json({ error: 'package_id required' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(package_id);
  if (!pkg) return res.status(400).json({ error: 'Package not found' });

  // Update booking with selected package + price
  db.prepare("UPDATE bookings SET package_id = ?, package_price = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(pkg.id, pkg.price, booking.id);

  // Clear existing sessions and auto-populate from package
  db.prepare('DELETE FROM booking_sessions WHERE booking_id = ?').run(booking.id);
  const pkgSessions = db.prepare('SELECT session_id FROM package_sessions WHERE package_id = ?').all(pkg.id);
  const ins = db.prepare('INSERT INTO booking_sessions (booking_id, session_id) VALUES (?, ?)');
  for (const ps of pkgSessions) {
    ins.run(booking.id, ps.session_id);
  }

  const dp = Math.round(pkg.price * 0.3);

  res.json({
    message: 'Package selected',
    package_name: pkg.name,
    package_price: pkg.price,
    dp_amount: dp,
    sessions_count: pkgSessions.length,
  });
});

// GET /api/invoice/:id — generate invoice data (MUST be before /:id)
router.get('/invoice/:id', (req, res) => {
  const type = req.query.type || 'dp';
  const booking = db.prepare('SELECT * FROM v_booking_finance WHERE booking_id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Get settings (vendor info)
  const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};

  // Get client phone
  const client = db.prepare('SELECT phone FROM clients WHERE id = ?').get(booking.client_id) || {};

  // Get sessions names
  const sessions = db.prepare(`
    SELECT s.name FROM booking_sessions bs
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ? ORDER BY s.default_order
  `).all(req.params.id).map(r => r.name);

  // DP amount
  const dpAmount = booking.dp_amount || Math.round(booking.package_price * 0.3);
  const remaining = booking.package_price - dpAmount;

  // Invoice number
  const pad = String(req.params.id).padStart(4, '0');
  const year = new Date().getFullYear();

  // Invoice date
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

  // Package name
  let packageName = booking.package_name;
  if (!packageName && booking.package_id) {
    const pkg = db.prepare('SELECT name FROM packages WHERE id = ?').get(booking.package_id);
    packageName = pkg ? pkg.name : '-';
  }

  res.json({
    invoice_number: `INV-${year}-${pad}`,
    invoice_date: dateStr,
    type,
    status: booking.status,
    client_name: booking.client_name,
    partner_name: booking.partner_name,
    phone: client.phone,
    event_date: booking.event_date,
    venue: booking.venue,
    package_name: packageName || '-',
    package_price: booking.package_price,
    additional_income: booking.additional_income || 0,
    dp_amount: dpAmount,
    remaining_payment: booking.remaining_payment || 0,
    total_paid: booking.total_paid || 0,
    sessions,
    bank_name: settings.bank_name || 'BCA',
    bank_account: settings.bank_account || '3420-1111-99',
    bank_holder: settings.bank_holder || 'Sorehari Photography',
  });
});

// GET public pelunasan page data (by token)
router.get('/pelunasan/:token', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.name AS client_name, c.partner_name, p.name AS package_name,
    COALESCE(b.package_price,0) + COALESCE(b.additional_income,0) - COALESCE(pay.total_paid,0) AS remaining_payment
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    LEFT JOIN packages p ON b.package_id = p.id
    LEFT JOIN (SELECT booking_id, SUM(amount) AS total_paid FROM payments GROUP BY booking_id) pay ON b.id = pay.booking_id
    WHERE b.pelunasan_token = ?
  `).get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Link tidak valid' });

  // Check if already completed
  if (booking.status === 'completed') {
    return res.json({ _done: true, booking_id: booking.id, message: 'Pembayaran sudah lunas ✅' });
  }

  // Check if pelunasan receipt already uploaded
  const pelunasanPayment = db.prepare("SELECT * FROM payments WHERE booking_id = ? AND type = 'pelunasan'").get(booking.id);
  if (pelunasanPayment) {
    return res.json({ _done: true, booking_id: booking.id, message: 'Bukti pelunasan sudah dikirim, menunggu verifikasi admin 🙏' });
  }

  // Get package sessions
  const sessions = db.prepare(`
    SELECT s.name FROM booking_sessions bs
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ? ORDER BY s.default_order
  `).all(booking.booking_id).map(r => r.name);

  const dpPaid = ['confirmed','in_progress','completed'].includes(booking.status);
  const dpAmount = booking.package_price ? Math.round(booking.package_price * 0.3) : 0;

  res.json({
    booking_id: booking.booking_id,
    client_name: booking.client_name,
    partner_name: booking.partner_name,
    event_date: booking.event_date,
    venue: booking.venue,
    package_name: booking.package_name,
    package_price: booking.package_price,
    dp_amount: dpPaid ? dpAmount : 0,
    remaining_payment: booking.remaining_payment,
    sessions,
    status: booking.status,
    _done: false,
  });
});

// POST upload pelunasan receipt
router.post('/pelunasan/:token/upload', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE pelunasan_token = ?').get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Link tidak valid' });

  const { amount, receipt, payment_method } = req.body;
  if (!amount) return res.status(400).json({ error: 'Jumlah pembayaran wajib diisi' });

  // Save receipt file if provided
  let refName = null;
  if (receipt && receipt.includes(',')) {
    const parts = receipt.split(',');
    const ext = parts[0].match(/image\/(\w+)/)?.[1] || 'jpg';
    const base64 = parts[1];
    const fs = require('fs');
    const uploadDir = require('path').join(__dirname, '..', 'private', 'uploads', 'receipts');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    refName = `pelunasan_${booking.id}_${Date.now()}.${ext}`;
    fs.writeFileSync(require('path').join(uploadDir, refName), Buffer.from(base64, 'base64'));
  }

  // Insert payment
  db.prepare(`
    INSERT INTO payments (booking_id, type, amount, payment_date, payment_method, reference, notes, status)
    VALUES (?, 'pelunasan', ?, date('now','localtime'), ?, ?, 'Pelunasan via form client', 'pending')
  `).run(booking.id, amount, payment_method || 'transfer', refName);

  res.json({ success: true, message: 'Bukti pelunasan terkirim. Menunggu verifikasi admin 🙏' });
});

// === PUBLIC: Upload bukti pembayaran ===
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'private', 'uploads', 'receipts');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// POST upload receipt by token (client)
router.post('/public/:token/upload-receipt', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_token = ?').get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { package_id, dp_amount, receipt_base64, receipt_filename, session_locations } = req.body;
  if (!receipt_base64 || !dp_amount) return res.status(400).json({ error: 'dp_amount and receipt required' });

  // If client also selected package, save it
  if (package_id && !booking.package_id) {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(package_id);
    if (pkg) {
      db.prepare("UPDATE bookings SET package_id = ?, package_price = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(pkg.id, pkg.price, booking.id);
      // Update booking ref for downstream use
      booking.package_id = pkg.id;
      booking.package_price = pkg.price;
      // Auto-populate sessions
      db.prepare('DELETE FROM booking_sessions WHERE booking_id = ?').run(booking.id);
      const pkgSessions = db.prepare('SELECT session_id FROM package_sessions WHERE package_id = ?').all(pkg.id);
      const ins = db.prepare('INSERT INTO booking_sessions (booking_id, session_id, location) VALUES (?, ?, ?)');
      
      const locs = session_locations || {};
      for (const ps of pkgSessions) {
        const loc = locs[ps.session_id] || '';
        ins.run(booking.id, ps.session_id, loc);
      }
    }
  }

  // Save file
  const ext = (receipt_filename || 'receipt.jpg').split('.').pop().toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
  if (!allowedExts.includes(ext)) return res.status(400).json({ error: 'Format file tidak didukung. Gunakan jpg/png/gif/webp/pdf' });
  const filename = `booking_${booking.id}_${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  const base64Data = receipt_base64.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

  // Record payment
  db.prepare('INSERT INTO payments (booking_id, type, amount, payment_date, payment_method, reference, notes, status) VALUES (?, ?, ?, datetime(\'now\',\'localtime\'), ?, ?, ?, \'pending\')')
    .run(booking.id, 'dp', dp_amount, 'transfer', filename, `Bukti upload dari client`);

  // Update status to pending_verification — menunggu admin verifikasi
  db.prepare("UPDATE bookings SET status = 'pending_verification', updated_at = datetime('now','localtime') WHERE id = ?").run(booking.id);

  // Mark associated lead as booked so it disappears from Inquiry list
  if (booking.lead_id) {
    db.prepare("UPDATE leads SET status = 'booked', updated_at = datetime('now','localtime') WHERE id = ?").run(booking.lead_id);
  }

  res.json({ message: 'Bukti pembayaran berhasil dikirim. Menunggu verifikasi admin 🙏', filename });
});

// Protect all following routes with requireAuth (Admin Only)
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);

// POST admin verifies DP and creates client
router.post('/:id/verify-dp', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'pending_verification') return res.status(400).json({ error: 'Booking not in pending_verification status' });

  let clientId = booking.client_id;
  if (!clientId) {
    // Create client from lead_id
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(booking.lead_id);
    if (!lead) return res.status(400).json({ error: 'Lead not found for this booking' });
    
    const clientName = `${lead.name}${lead.partner_name ? ' & ' + lead.partner_name : ''}`;
    const clientResult = db.prepare('INSERT INTO clients (lead_id, name, partner_name, phone, email) VALUES (?, ?, ?, ?, ?)')
      .run(lead.id, clientName, lead.partner_name, lead.phone, lead.email);
    clientId = clientResult.lastInsertRowid;
    
    // Update booking with client_id
    db.prepare("UPDATE bookings SET client_id = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(clientId, booking.id);
  }

  // Update status to confirmed
  db.prepare("UPDATE bookings SET status = 'confirmed', updated_at = datetime('now','localtime') WHERE id = ?").run(booking.id);

  // Verify the DP payment in database
  db.prepare("UPDATE payments SET status = 'verified' WHERE booking_id = ? AND type = 'dp'").run(booking.id);

  // Update lead status to booked
  db.prepare("UPDATE leads SET status = 'booked', updated_at = datetime('now','localtime') WHERE id = ?").run(booking.lead_id);

  res.json({ success: true, status: 'confirmed', client_id: clientId });
});

// POST confirm pelunasan (admin) — only records payment, does NOT change work status
router.post('/:id/confirm-pelunasan', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Verify the pelunasan payment in database so it is officially counted as paid
  db.prepare("UPDATE payments SET status = 'verified' WHERE booking_id = ? AND type = 'pelunasan'").run(booking.id);

  res.json({ success: true, message: 'Pelunasan dikonfirmasi' });
});

// POST generate pelunasan token
router.post('/:id/generate-pelunasan-token', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  let token = booking.pelunasan_token;
  if (!token) {
    const crypto = require('crypto');
    token = crypto.randomUUID();
    db.prepare("UPDATE bookings SET pelunasan_token = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(token, booking.id);
  }

  res.json({ pelunasan_token: token });
});

// GET /api/bookings/calendar/events (MUST be before /:id)
router.get('/calendar/events', (req, res) => {
  const { month } = req.query;
  let sql = "SELECT booking_id, client_name, partner_name, event_date, event_name, venue, status FROM v_booking_finance";
  const params = [];
  if (month) { sql += " WHERE strftime('%Y-%m', event_date) = ?"; params.push(month); }
  sql += ' ORDER BY event_date ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET all bookings (with finance)
router.get('/', (req, res) => {
  const { status, month, search } = req.query;

  // Auto transition active bookings first
  try {
    const { autoTransitionBooking } = require('../helpers/statusAutoTransition');
    const active = db.prepare("SELECT id FROM bookings WHERE status IN ('confirmed', 'in_progress', 'event_day')").all();
    for (const b of active) {
      autoTransitionBooking(b.id);
    }
  } catch (e) {
    console.error('Auto transition error in bookings GET /:', e);
  }

  let sql = 'SELECT * FROM v_booking_finance';
  const params = [];
  const conditions = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (month) { conditions.push("strftime('%Y-%m', event_date) = ?"); params.push(month); }
  if (search) { conditions.push('(client_name LIKE ? OR venue LIKE ? OR event_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY event_date ASC';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/bookings/:id/unpaid-crew
router.get('/:id/unpaid-crew', (req, res) => {
  const unpaid = db.prepare(`
    SELECT bsc.id, bsc.freelancer_id, bsc.fee_amount, f.name AS freelancer_name, s.name AS session_name
    FROM booking_session_crew bsc
    JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
    JOIN freelancers f ON bsc.freelancer_id = f.id
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ? AND bsc.is_paid = 0
  `).all(req.params.id);
  res.json(unpaid);
});

// GET single booking with full detail
router.get('/:id', (req, res) => {
  // Auto transition this booking first
  try {
    const { autoTransitionBooking } = require('../helpers/statusAutoTransition');
    autoTransitionBooking(req.params.id);
  } catch (e) {
    console.error('Auto transition error in GET /:id:', e);
  }

  const booking = db.prepare('SELECT * FROM v_booking_finance WHERE booking_id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const expenses = db.prepare(`
    SELECT be.*, f.name AS freelancer_name
    FROM booking_expenses be
    LEFT JOIN freelancers f ON be.freelancer_id = f.id
    WHERE be.booking_id = ?
    ORDER BY be.created_at DESC
  `).all(req.params.id);

  const payments = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_date DESC').all(req.params.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(booking.client_id);

  // Booking sessions with crew
  const sessions = db.prepare(`
    SELECT bs.*, s.name AS session_name, s.default_order
    FROM booking_sessions bs
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ?
    ORDER BY s.default_order
  `).all(req.params.id);

  // Attach crew per session + fee
  const crewStmt = db.prepare(`
    SELECT bsc.*, f.name AS freelancer_name, f.skill
    FROM booking_session_crew bsc
    JOIN freelancers f ON bsc.freelancer_id = f.id
    WHERE bsc.booking_session_id = ?
  `);
  for (const s of sessions) {
    s.crew = crewStmt.all(s.id);
    s.total_crew_fee = s.crew.reduce((sum, c) => sum + c.fee_amount, 0);
  }

  // Calculate actual freelance cost from crew assignments
  const totalFreelanceCost = sessions.reduce((sum, s) => sum + s.total_crew_fee, 0);

  // Calculate product cost from package
  let totalProductCost = 0;
  if (booking.package_id) {
    const prods = db.prepare(`
      SELECT SUM(p.unit_cost * pp.quantity) AS total
      FROM package_products pp
      JOIN products p ON pp.product_id = p.id
      WHERE pp.package_id = ?
    `).get(booking.package_id);
    totalProductCost = prods.total || 0;
  }

  res.json({
    ...booking,
    expenses,
    payments,
    client,
    sessions,
    finance: {
      total_product_cost: totalProductCost,
      total_freelance_cost: totalFreelanceCost,
      total_estimated_cost: totalProductCost + totalFreelanceCost,
      estimated_profit: booking.total_income - totalProductCost - totalFreelanceCost,
    }
  });
});

// POST new booking
router.post('/', (req, res) => {
  const { client_id, event_name, event_date, event_end_date, venue, package_id, package_price, notes } = req.body;
  if (!client_id || !event_date) return res.status(400).json({ error: 'client_id and event_date required' });

  const result = db.prepare(`
    INSERT INTO bookings (client_id, event_name, event_date, event_end_date, venue, package_id, package_price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, event_name || null, event_date, event_end_date || null, venue || null, package_id || null, package_price || 0, notes || null);

  // Auto-populate booking sessions from package
  if (package_id) {
    const pkgSessions = db.prepare('SELECT session_id FROM package_sessions WHERE package_id = ?').all(package_id);
    const ins = db.prepare('INSERT INTO booking_sessions (booking_id, session_id) VALUES (?, ?)');
    for (const ps of pkgSessions) {
      ins.run(result.lastInsertRowid, ps.session_id);
    }
  }

  res.json({ id: result.lastInsertRowid, message: 'Booking created' });
});

// PUT update booking
router.put('/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const fields = ['event_name', 'event_date', 'event_end_date', 'venue', 'package_id', 'package_price', 'additional_income', 'additional_income_note', 'notes'];
  const updates = [];
  const params = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now','localtime')");
  params.push(req.params.id);
  db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json(db.prepare('SELECT * FROM v_booking_finance WHERE booking_id = ?').get(req.params.id));
});

// PUT update booking status
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['dp_pending', 'confirmed', 'in_progress', 'event_day', 'editing', 'delivery', 'completed', 'archived', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Invalid status. Use: ${valid.join(', ')}` });

  // Payment gate: editing, delivery, completed require full payment (pelunasan)
  const postProductionStatuses = ['editing', 'delivery', 'completed'];
  if (postProductionStatuses.includes(status)) {
    const booking = db.prepare('SELECT package_price FROM bookings WHERE id = ?').get(req.params.id);
    const { total_paid } = db.prepare('SELECT COALESCE(SUM(amount),0) AS total_paid FROM payments WHERE booking_id = ?').get(req.params.id);
    const price = booking ? (booking.package_price || 0) : 0;
    if (price > 0 && total_paid < price) {
      const sisa = price - total_paid;
      const fmt = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
      return res.status(400).json({
        error: `Tidak bisa pindah ke tahap ini. Client belum melunasi pembayaran. Sisa: ${fmt(sisa)}`,
        sisa,
        total_paid,
        package_price: price
      });
    }
  }

  // Freelance payment gate: 'completed' status requires all assigned crew to be paid
  if (status === 'completed') {
    const unpaid = db.prepare(`
      SELECT bsc.id, bsc.freelancer_id, bsc.fee_amount, f.name AS freelancer_name, s.name AS session_name
      FROM booking_session_crew bsc
      JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
      JOIN freelancers f ON bsc.freelancer_id = f.id
      JOIN sessions s ON bs.session_id = s.id
      WHERE bs.booking_id = ? AND bsc.is_paid = 0
    `).all(req.params.id);

    if (unpaid.length > 0) {
      const names = unpaid.map(u => `${u.freelancer_name} (${u.session_name}: Rp ${Number(u.fee_amount).toLocaleString('id-ID')})`).join(', ');
      return res.status(400).json({
        error: `Ada crew freelancer yang belum terbayar: ${names}`,
        unpaid
      });
    }
  }

  db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM v_booking_finance WHERE booking_id = ?').get(req.params.id));
});

// === BOOKING SESSIONS (Timeline) ===

router.get('/:id/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT bs.*, s.name AS session_name, s.default_order
    FROM booking_sessions bs
    JOIN sessions s ON bs.session_id = s.id
    WHERE bs.booking_id = ?
    ORDER BY s.default_order
  `).all(req.params.id);

  // Attach crew
  const crewStmt = db.prepare(`
    SELECT bsc.*, f.name AS freelancer_name, f.skill
    FROM booking_session_crew bsc
    JOIN freelancers f ON bsc.freelancer_id = f.id
    WHERE bsc.booking_session_id = ?
  `);
  for (const s of sessions) {
    s.crew = crewStmt.all(s.id);
    s.total_crew_fee = s.crew.reduce((sum, c) => sum + c.fee_amount, 0);
  }

  res.json(sessions);
});

router.post('/:id/sessions', (req, res) => {
  const { session_id, event_date, event_time, location, gps_link, notes } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  const result = db.prepare('INSERT INTO booking_sessions (booking_id, session_id, event_date, event_time, location, gps_link, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.params.id, session_id, event_date || null, event_time || null, location || null, gps_link || null, notes || null);
  res.json({ id: result.lastInsertRowid, message: 'Session added' });
});

router.put('/:id/sessions/:sid', (req, res) => {
  const { event_date, event_time, location, gps_link, notes, is_done } = req.body;
  db.prepare('UPDATE booking_sessions SET event_date = ?, event_time = ?, location = ?, gps_link = ?, notes = ?, is_done = ? WHERE id = ? AND booking_id = ?')
    .run(event_date, event_time, location || null, gps_link || null, notes || null, is_done || 0, req.params.sid, req.params.id);
  res.json({ message: 'Session updated' });
});

router.delete('/:id/sessions/:sid', (req, res) => {
  db.prepare('DELETE FROM booking_sessions WHERE id = ? AND booking_id = ?').run(req.params.sid, req.params.id);
  res.json({ message: 'Session deleted' });
});

// === CREW PER SESSION ===

// POST assign crew to a booking session
router.post('/:id/sessions/:sid/crew', (req, res) => {
  const { freelancer_id, fee_amount } = req.body;
  if (!freelancer_id) return res.status(400).json({ error: 'freelancer_id required' });

  // Use fee from freelancer_fees if no fee_amount provided
  let fee = fee_amount;
  if (fee === undefined || fee === null) {
    const session = db.prepare('SELECT session_id FROM booking_sessions WHERE id = ?').get(req.params.sid);
    const feeRow = db.prepare('SELECT fee_amount FROM freelancer_fees WHERE freelancer_id = ? AND session_id = ?').get(freelancer_id, session.session_id);
    fee = feeRow ? feeRow.fee_amount : 0;
  }

  const result = db.prepare('INSERT OR REPLACE INTO booking_session_crew (booking_session_id, freelancer_id, fee_amount) VALUES (?, ?, ?)')
    .run(req.params.sid, freelancer_id, fee);
  res.json({ id: result.lastInsertRowid, message: 'Crew assigned', fee_amount: fee });
});

// DELETE crew from booking session
router.delete('/:id/sessions/:sid/crew/:cid', (req, res) => {
  db.prepare('DELETE FROM booking_session_crew WHERE id = ? AND booking_session_id = ?').run(req.params.cid, req.params.sid);
  res.json({ message: 'Crew removed' });
});

// GET available freelancers for a session (with their fee for this session type)
router.get('/:id/sessions/:sid/available-crew', (req, res) => {
  const session = db.prepare('SELECT session_id FROM booking_sessions WHERE id = ?').get(req.params.sid);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const crew = db.prepare(`
    SELECT f.id, f.name, f.skill, f.is_active,
           COALESCE(ff.fee_amount, f.rate_default, 0) AS session_fee
    FROM freelancers f
    LEFT JOIN freelancer_fees ff ON ff.freelancer_id = f.id AND ff.session_id = ?
    WHERE f.is_active = 1
    ORDER BY f.name
  `).all(session.session_id);
  res.json(crew);
});

// === EXPENSES ===

router.get('/:id/expenses', (req, res) => {
  const expenses = db.prepare(`
    SELECT be.*, f.name AS freelancer_name
    FROM booking_expenses be
    LEFT JOIN freelancers f ON be.freelancer_id = f.id
    WHERE be.booking_id = ?
    ORDER BY be.created_at DESC
  `).all(req.params.id);
  res.json(expenses);
});

router.post('/:id/expenses', (req, res) => {
  const { category, description, amount, freelancer_id } = req.body;
  if (!description || !amount) return res.status(400).json({ error: 'description and amount required' });

  const result = db.prepare('INSERT INTO booking_expenses (booking_id, category, description, amount, freelancer_id) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, category || 'freelance', description, amount, freelancer_id || null);
  res.json({ id: result.lastInsertRowid, message: 'Expense added' });
});

router.put('/:id/expenses/:eid', (req, res) => {
  const { category, description, amount, freelancer_id } = req.body;
  db.prepare('UPDATE booking_expenses SET category = ?, description = ?, amount = ?, freelancer_id = ? WHERE id = ? AND booking_id = ?')
    .run(category || 'freelance', description, amount, freelancer_id || null, req.params.eid, req.params.id);
  res.json({ message: 'Expense updated' });
});

router.delete('/:id/expenses/:eid', (req, res) => {
  db.prepare('DELETE FROM booking_expenses WHERE id = ? AND booking_id = ?').run(req.params.eid, req.params.id);
  res.json({ message: 'Expense deleted' });
});

// === PAYMENTS ===

router.get('/:id/payments', (req, res) => {
  const payments = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_date DESC').all(req.params.id);
  res.json(payments);
});

router.post('/:id/payments', (req, res) => {
  const { type, amount, payment_date, payment_method, reference, notes } = req.body;
  if (!amount || !payment_date) return res.status(400).json({ error: 'amount and payment_date required' });

  const result = db.prepare('INSERT INTO payments (booking_id, type, amount, payment_date, payment_method, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.params.id, type || 'dp', amount, payment_date, payment_method || null, reference || null, notes || null);
  res.json({ id: result.lastInsertRowid, message: 'Payment recorded' });
});

router.delete('/:id/payments/:pid', (req, res) => {
  db.prepare('DELETE FROM payments WHERE id = ? AND booking_id = ?').run(req.params.pid, req.params.id);
  res.json({ message: 'Payment deleted' });
});

module.exports = router;
