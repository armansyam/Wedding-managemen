const express = require('express');
const router = express.Router();
const db = require('../db');

function formatBookingCode(bookingId, year) {
  return `SH-${year}-${String(bookingId).padStart(4, '0')}`;
}

function parseBookingCode(code) {
  // Accepts: SH-2026-0020 or just 20 or SH-2026-20
  const full = (code || '').trim().toUpperCase();
  const match = full.match(/^SH-(\d{4})-(\d+)$/) || full.match(/^SH-\d{4}-0*(\d+)$/);
  if (match) return parseInt(match[match.length - 1], 10);
  // Fallback: plain number
  const plain = parseInt(full, 10);
  if (!isNaN(plain) && plain > 0) return plain;
  return null;
}

// GET /api/track?code=SH-2026-0020
router.get('/', (req, res) => {
  const { code } = req.query;

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Masukkan kode booking (contoh: SH-2026-0020)' });
  }

  const bookingId = parseBookingCode(code);
  if (!bookingId) {
    return res.status(400).json({ error: 'Format kode tidak valid. Gunakan format: SH-YYYY-XXXX' });
  }

  // Auto transition first
  try {
    const { autoTransitionBooking } = require('../helpers/statusAutoTransition');
    autoTransitionBooking(bookingId);
  } catch (e) {
    console.error('Auto transition error:', e);
  }

  const booking = db.prepare(`
    SELECT b.id, b.event_date, b.venue, b.status, b.created_at,
           c.name AS client_name, c.partner_name,
           p.name AS package_name,
           strftime('%Y', b.created_at) AS year
    FROM bookings b
    LEFT JOIN clients c ON b.client_id = c.id
    LEFT JOIN packages p ON b.package_id = p.id
    WHERE b.id = ? AND b.status NOT IN ('proposal_sent','pending_verification','cancelled')
  `).get(bookingId);

  if (!booking) {
    return res.status(404).json({
      error: 'Data tidak ditemukan. Pastikan kode sudah benar, atau hubungi admin kami.'
    });
  }

  const STAGES = ['confirmed', 'in_progress', 'event_day', 'editing', 'delivery', 'completed'];
  const stageIndex = STAGES.indexOf(booking.status);
  const bookingCode = formatBookingCode(booking.id, booking.year || new Date().getFullYear());

  res.json({
    booking_code: bookingCode,
    client_name: booking.client_name || '-',
    partner_name: booking.partner_name || null,
    event_date: booking.event_date,
    venue: booking.venue || '-',
    package_name: booking.package_name || '-',
    status: booking.status,
    stage_index: stageIndex < 0 ? 0 : stageIndex,
    stages: STAGES
  });
});

module.exports = router;
