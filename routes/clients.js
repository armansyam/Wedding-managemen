const express = require('express');
const router = express.Router();
const db = require('../db');

// GET confirmed clients (status: confirmed, in_progress, event_day, completed)
router.get('/confirmed', (req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id, c.name, c.partner_name, c.phone, c.email, c.notes, c.created_at,
      b.id AS booking_id, b.event_date, b.venue, b.status AS booking_status, b.package_price,
      p.name AS package_name,
      COALESCE(pay.total_paid, 0) AS total_paid,
      COALESCE(exp.total_expense, 0) AS total_expense,
      (COALESCE(pay.total_paid,0) - COALESCE(exp.total_expense,0)) AS profit
    FROM clients c
    JOIN bookings b ON b.client_id = c.id
    LEFT JOIN packages p ON b.package_id = p.id
    LEFT JOIN (SELECT booking_id, SUM(amount) AS total_paid FROM payments GROUP BY booking_id) pay ON pay.booking_id = b.id
    LEFT JOIN (SELECT booking_id, SUM(amount) AS total_expense FROM booking_expenses GROUP BY booking_id) exp ON exp.booking_id = b.id
    WHERE b.status IN ('confirmed','in_progress','event_day','completed')
    ORDER BY b.event_date DESC
  `).all();
  res.json(rows);
});

// GET all clients
router.get('/', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM clients';
  const params = [];
  if (search) {
    sql += ' WHERE name LIKE ? OR phone LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET client by id (with bookings)
router.get('/:id', (req, res) => {
  if (req.params.id === 'confirmed') return; // skip — handled above
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const bookings = db.prepare(`
    SELECT b.*, p.name AS package_name,
      (SELECT COALESCE(SUM(amount),0) FROM booking_expenses WHERE booking_id = b.id) AS total_expense,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id = b.id) AS total_paid
    FROM bookings b
    LEFT JOIN packages p ON b.package_id = p.id
    WHERE b.client_id = ?
    ORDER BY b.event_date DESC
  `).all(req.params.id);

  res.json({ ...client, bookings });
});

// POST new client
router.post('/', (req, res) => {
  const { name, partner_name, email, phone, address, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  const result = db.prepare('INSERT INTO clients (name, partner_name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, partner_name || null, email || null, phone, address || null, notes || null);
  res.json({ id: result.lastInsertRowid, message: 'Client created' });
});

// PUT update client
router.put('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const fields = ['name', 'partner_name', 'email', 'phone', 'address', 'notes'];
  const updates = [];
  const params = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now','localtime')");
  params.push(req.params.id);
  db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

module.exports = router;
