const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all sessions
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY default_order ASC').all();
  // Attach avg_fee from freelancer_fees for estimations
  for (const s of rows) {
    const fee = db.prepare('SELECT COALESCE(AVG(fee_amount), 0) AS avg_fee FROM freelancer_fees WHERE session_id = ?').get(s.id);
    s.avg_fee = Math.round(fee.avg_fee);
  }
  res.json(rows);
});

// POST create session
router.post('/', (req, res) => {
  const { name, description, default_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO sessions (name, description, default_order) VALUES (?, ?, ?)').run(name, description || null, default_order || 0);
  res.json({ id: result.lastInsertRowid, message: 'Session created' });
});

// PUT update session
router.put('/:id', (req, res) => {
  const { name, description, default_order, is_active } = req.body;
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (default_order !== undefined) { fields.push('default_order = ?'); params.push(default_order); }
  if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Session updated' });
});

// DELETE session (soft)
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Session deactivated' });
});

module.exports = router;
