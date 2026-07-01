const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/archive — leads hilang + bookings completed/cancelled
router.get('/', (req, res) => {
  const type = req.query.type; // 'leads' or 'bookings' or undefined (all)

  const results = { lost_leads: [], archived_bookings: [] };

  if (!type || type === 'leads') {
    results.lost_leads = db.prepare(`
      SELECT * FROM leads WHERE status = 'lost' ORDER BY updated_at DESC
    `).all();
  }

  if (!type || type === 'bookings') {
    results.archived_bookings = db.prepare(`
      SELECT b.*, c.name as client_name, c.partner_name, c.phone, p.name as package_name
      FROM bookings b
      LEFT JOIN clients c ON b.client_id = c.id
      LEFT JOIN packages p ON b.package_id = p.id
      WHERE b.status IN ('completed', 'cancelled')
      ORDER BY b.updated_at DESC
    `).all();
  }

  res.json(results);
});

module.exports = router;
