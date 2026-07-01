const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all freelancer payments (MUST be before /:id)
router.get('/payments/all', (req, res) => {
  const payments = db.prepare(`
    SELECT fp.*, f.name AS freelancer_name
    FROM freelance_payments fp
    JOIN freelancers f ON fp.freelancer_id = f.id
    ORDER BY fp.payment_date DESC
  `).all();
  res.json(payments);
});

// POST create freelancer (MUST be before /:id)
router.post('/', (req, res) => {
  const { name, skill, phone, rate_default, notes, bank_account } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO freelancers (name, skill, phone, rate_default, notes, bank_account) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, skill || null, phone || null, rate_default || 0, notes || null, bank_account || null);
  res.json({ id: result.lastInsertRowid, message: 'Freelancer created' });
});

// GET all freelancers with earnings summary
router.get('/', (req, res) => {
  const { active, search } = req.query;
  let sql = `
    SELECT f.*,
      COALESCE(earn.total_earned, 0) AS total_earned,
      COALESCE(pay.total_paid, 0) AS total_paid_freelance,
      COALESCE(earn.total_earned, 0) - COALESCE(pay.total_paid, 0) AS remaining_to_pay,
      COALESCE(un.unpaid_count, 0) AS unpaid_count
    FROM freelancers f
    LEFT JOIN (
      SELECT bsc.freelancer_id, SUM(bsc.fee_amount) AS total_earned
      FROM booking_session_crew bsc
      JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
      JOIN bookings b ON bs.booking_id = b.id
      WHERE b.status IN ('confirmed','in_progress','event_day','completed')
      GROUP BY bsc.freelancer_id
    ) earn ON earn.freelancer_id = f.id
    LEFT JOIN (
      SELECT bsc.freelancer_id, SUM(bsc.fee_amount) AS total_paid
      FROM booking_session_crew bsc
      JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
      JOIN bookings b ON bs.booking_id = b.id
      WHERE bsc.is_paid = 1 AND b.status IN ('confirmed','in_progress','event_day','completed')
      GROUP BY bsc.freelancer_id
    ) pay ON pay.freelancer_id = f.id
    LEFT JOIN (
      SELECT bsc.freelancer_id, COUNT(*) AS unpaid_count
      FROM booking_session_crew bsc
      JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
      JOIN bookings b ON bs.booking_id = b.id
      WHERE bsc.is_paid = 0 AND b.status IN ('confirmed','in_progress','event_day','completed')
      GROUP BY bsc.freelancer_id
    ) un ON un.freelancer_id = f.id
  `;
  const params = [];
  const wheres = [];
  if (active !== undefined && active !== '0') wheres.push('f.is_active = 1');
  if (search) { wheres.push('(f.name LIKE ? OR f.phone LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY remaining_to_pay DESC';
  const freelancers = db.prepare(sql).all(...params);

  // Attach fees to each freelancer
  const allFees = db.prepare('SELECT ff.*, s.name AS session_name FROM freelancer_fees ff JOIN sessions s ON ff.session_id = s.id').all();
  const feesByFl = {};
  for (const f of allFees) { (feesByFl[f.freelancer_id] = feesByFl[f.freelancer_id] || []).push(f); }
  for (const fl of freelancers) fl.fees = feesByFl[fl.id] || [];

  res.json(freelancers);
});

// GET freelancer by id with detail earnings
router.get('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Freelancer not found' });

  const fees = db.prepare(`
    SELECT ff.*, s.name AS session_name
    FROM freelancer_fees ff
    LEFT JOIN sessions s ON ff.session_id = s.id
    WHERE ff.freelancer_id = ?
  `).all(req.params.id);

  const earnings = db.prepare(`
    SELECT bsc.id AS crew_id, bsc.fee_amount, bsc.is_paid, bsc.paid_at,
           s.name AS session_name, b.event_date, b.id AS booking_id,
           c.name AS client_name, b.status AS booking_status
    FROM booking_session_crew bsc
    JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
    JOIN sessions s ON bs.session_id = s.id
    JOIN bookings b ON bs.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    WHERE bsc.freelancer_id = ? AND b.status IN ('confirmed','in_progress','event_day','completed')
    ORDER BY b.event_date DESC
  `).all(req.params.id);

  const totalEarned = earnings.reduce((s, e) => s + e.fee_amount, 0);
  const totalPaid = earnings.filter(e => e.is_paid).reduce((s, e) => s + e.fee_amount, 0);
  const unpaidJobs = earnings.filter(e => !e.is_paid);

  // Legacy lump-sum payments (history only, NOT included in totals)
  const payments = db.prepare('SELECT * FROM freelance_payments WHERE freelancer_id = ? ORDER BY payment_date DESC').all(req.params.id);

  res.json({
    ...f, fees, earnings, unpaidJobs, payments,
    total_earned: totalEarned,
    total_paid: totalPaid,
    remaining: totalEarned - totalPaid,
  });
});

// GET fee per session
router.get('/:id/fees', (req, res) => {
  const fees = db.prepare(`
    SELECT ff.*, s.name AS session_name
    FROM freelancer_fees ff
    LEFT JOIN sessions s ON ff.session_id = s.id
    WHERE ff.freelancer_id = ?
  `).all(req.params.id);
  res.json(fees);
});

// POST save fee per session (bulk upsert)
router.post('/:id/fees', (req, res) => {
  const { fees } = req.body;
  if (!fees || !Array.isArray(fees)) return res.status(400).json({ error: 'fees array required' });

  const upsert = db.prepare('INSERT INTO freelancer_fees (freelancer_id, session_id, fee_amount) VALUES (?, ?, ?) ON CONFLICT(freelancer_id, session_id) DO UPDATE SET fee_amount = excluded.fee_amount');
  const tx = db.transaction(() => {
    for (const f of fees) {
      if (f.session_id && f.fee_amount >= 0) {
        upsert.run(req.params.id, f.session_id, f.fee_amount);
      }
    }
  });
  tx();
  res.json({ message: 'Fees saved' });
});

// POST bayar per-job
router.post('/:id/pay-job', (req, res) => {
  const { crew_ids } = req.body;
  if (!crew_ids || !crew_ids.length) return res.status(400).json({ error: 'crew_ids required' });
  const stmt = db.prepare("UPDATE booking_session_crew SET is_paid = 1, paid_at = datetime('now','localtime') WHERE id = ?");
  const tx = db.transaction(() => {
    for (const cid of crew_ids) stmt.run(cid);
  });
  tx();
  // Also record in freelance_payments for backwards compat
  const jobFees = db.prepare(`SELECT fee_amount FROM booking_session_crew WHERE id IN (${crew_ids.map(() => '?').join(',')})`).all(...crew_ids);
  const totalAmount = jobFees.reduce((s, j) => s + j.fee_amount, 0);
  if (totalAmount > 0) {
    db.prepare('INSERT INTO freelance_payments (freelancer_id, amount, payment_date, method, notes) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, totalAmount, new Date().toISOString().split('T')[0], 'job_payment', `Bayar ${crew_ids.length} job`);
  }
  res.json({ message: 'Jobs paid', count: crew_ids.length, total: totalAmount });
});

// POST bayar lump-sum (legacy)
router.post('/:id/pay', (req, res) => {
  const { amount, payment_date, method, notes } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' });
  const result = db.prepare('INSERT INTO freelance_payments (freelancer_id, amount, payment_date, method, notes) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, amount, payment_date || new Date().toISOString().split('T')[0], method || 'transfer', notes || null);
  res.json({ id: result.lastInsertRowid, message: 'Payment recorded' });
});

// PUT update freelancer
router.put('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM freelancers WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Freelancer not found' });

  const { name, skill, phone, rate_default, notes, bank_account } = req.body;
  db.prepare("UPDATE freelancers SET name=?, skill=?, phone=?, rate_default=?, notes=?, bank_account=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(name || f.name, skill || f.skill, phone ?? f.phone, rate_default ?? f.rate_default, notes ?? f.notes, bank_account ?? f.bank_account, req.params.id);
  res.json(db.prepare('SELECT * FROM freelancers WHERE id = ?').get(req.params.id));
});

// DELETE (soft) freelancer
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE freelancers SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deactivated' });
});

// POST activate freelancer
router.post('/:id/activate', (req, res) => {
  db.prepare('UPDATE freelancers SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activated' });
});

module.exports = router;
