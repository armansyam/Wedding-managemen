const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const sse = require('../helpers/sse');

// POST new lead (PUBLIC - inquiry form submission)
router.post('/', (req, res) => {
  const { name, email, phone, partner_name, wedding_date, venue, package_interest, message, source } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const result = db.prepare('INSERT INTO leads (name, email, phone, partner_name, wedding_date, venue, package_interest, message, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, email || null, phone, partner_name || null, wedding_date || null, venue || null, package_interest || null, message || null, source || 'inquiry_form');
  const newLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
  // Notify all connected admin SSE clients of the new lead
  sse.broadcast('new_lead', newLead);
  res.json({ id: result.lastInsertRowid, message: 'Lead created' });
});

// All other routes require auth
router.use(requireAuth);

// GET all leads
router.get('/', (req, res) => {
  const { status, search } = req.query;
  let sql = `
    SELECT leads.*, 
           b.id AS booking_id, 
           b.booking_token AS booking_token, 
           b.created_at AS booking_created_at
    FROM leads
    LEFT JOIN (
      SELECT id, lead_id, booking_token, created_at, status
      FROM bookings
      WHERE id IN (SELECT MAX(id) FROM bookings GROUP BY lead_id)
    ) b ON b.lead_id = leads.id AND b.status = 'proposal_sent'
  `;
  const params = [];
  const conditions = [];
  if (status) { conditions.push('leads.status = ?'); params.push(status); }
  if (search) { conditions.push('(leads.name LIKE ? OR leads.phone LIKE ? OR leads.partner_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY leads.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET lead by id
router.get('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  
  // Look up associated booking token (latest one first)
  const booking = db.prepare('SELECT id, booking_token FROM bookings WHERE lead_id = ? ORDER BY id DESC').get(lead.id);
  if (booking) {
    lead.booking_id = booking.id;
    lead.booking_token = booking.booking_token;
  }
  
  res.json(lead);
});

// PUT update lead
router.put('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const fields = ['name', 'email', 'phone', 'partner_name', 'wedding_date', 'venue', 'package_interest', 'message', 'status', 'notes', 'source'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now','localtime')");
  params.push(req.params.id);
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  // Notify all connected admin SSE clients of the update
  sse.broadcast('lead_updated', updated);
  res.json(updated);
});

// DELETE lead
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  // Notify admin SSE clients
  sse.broadcast('lead_deleted', { id: parseInt(req.params.id) });
  res.json({ message: 'Lead deleted' });
});

// POST convert lead → booking + token + wa.me link (NO client yet)
router.post('/:id/convert', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { event_date, venue, package_id, package_price, notes } = req.body;
  if (!event_date) return res.status(400).json({ error: 'event_date required' });

  // Clean up any old booking proposal for this lead to avoid duplicates
  db.prepare("DELETE FROM bookings WHERE lead_id = ? AND status = 'proposal_sent'").run(lead.id);

  const bookingToken = crypto.randomUUID();

  // Create booking WITHOUT client — client created after admin verifies DP
  const bookingResult = db.prepare('INSERT INTO bookings (client_id, lead_id, booking_token, event_name, event_date, venue, package_id, package_price, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(null, lead.id, bookingToken, `${lead.name}${lead.partner_name ? ' & ' + lead.partner_name : ''}`, event_date, venue || lead.venue, package_id || null, package_price || 0, notes || null, 'proposal_sent');

  const bookingId = bookingResult.lastInsertRowid;

  // Update lead status
  db.prepare("UPDATE leads SET status = 'proposal_sent', updated_at = datetime('now','localtime') WHERE id = ?").run(lead.id);

  // Get vendor phone from settings
  const vendorPhone = (db.prepare("SELECT value FROM settings WHERE key = 'vendor_phone'").get()?.value || '').replace(/^0/, '62').replace(/[^0-9]/g, '');

  // Build public booking link
  const bookingLink = `${req.protocol}://${req.headers.host}/booking/${bookingToken}`;

  // Get vendor name for template
  const vendorName = db.prepare("SELECT value FROM settings WHERE key = 'vendor_name'").get()?.value || 'Sorehari Photography';

  // Build wa.me message from template
  const rawTemplate = db.prepare("SELECT value FROM settings WHERE key = 'wa_booking_proposal'").get()?.value;
  const { renderWATemplate } = require('../helpers/wa');
  const waMessage = rawTemplate
    ? renderWATemplate(rawTemplate, { name: lead.name, vendor_name: vendorName, booking_link: bookingLink })
    : `Halo Kak ${lead.name}! 👋\n\nTerima kasih sudah menghubungi *${vendorName}* ✨\n\nUntuk memilih paket dan mengirimkan bukti DP, silakan klik link di bawah ya, Kak:\n${bookingLink}\n\nSetelah memilih paket, harga dan detail booking akan otomatis terupdate. Kami tunggu kabarnya! 😊📸`;

  const waLink = vendorPhone ? `https://wa.me/${vendorPhone}?text=${encodeURIComponent(waMessage)}` : null;

  res.json({
    booking_id: bookingId,
    booking_token: bookingToken,
    booking_link: bookingLink,
    message: 'Lead converted to booking (proposal sent)',
    wa_link: waLink,
    wa_message: waMessage,
  });
});

module.exports = router;
