const express = require('express');
const router = express.Router();
const db = require('../db');

// GET dashboard summary
router.get('/summary', (req, res) => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = now.getMonth() === 0 ? `${now.getFullYear() - 1}-12` : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  // This month financials
  const thisMonthSummary = db.prepare(`
    SELECT * FROM v_monthly_summary WHERE month = ?
  `).get(thisMonth) || { total_bookings: 0, total_income: 0, total_expense: 0, total_profit: 0, total_collected: 0, total_pending: 0 };

  // Lead counts
  const leadCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM leads GROUP BY status
  `).all();

  // Upcoming events (next 30 days)
  const upcoming = db.prepare(`
    SELECT * FROM v_booking_finance
    WHERE event_date >= date('now') AND event_date <= date('now', '+30 days')
    AND status IN ('confirmed', 'in_progress')
    ORDER BY event_date ASC LIMIT 10
  `).all();

  // Pending payments
  const pendingPayments = db.prepare(`
    SELECT * FROM v_booking_finance
    WHERE remaining_payment > 0 AND status NOT IN ('cancelled', 'archived')
    ORDER BY event_date ASC
  `).all();

  // Pipeline
  const pipeline = db.prepare(`
    SELECT status, COUNT(*) as count FROM leads
    WHERE status NOT IN ('booked', 'lost')
    GROUP BY status
  `).all();

  // Active bookings by status
  const bookingStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM bookings
    WHERE status NOT IN ('cancelled', 'archived')
    GROUP BY status
  `).all();

  // Recent leads (last 5)
  const recentLeads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5').all();

  res.json({
    thisMonth: thisMonthSummary,
    leads: leadCounts,
    upcoming,
    pendingPayments,
    pipeline,
    bookingStatus,
    recentLeads
  });
});

// GET monthly finance
router.get('/finance', (req, res) => {
  const { months } = req.query;
  const limit = parseInt(months) || 12;

  const data = db.prepare(`
    SELECT * FROM v_monthly_summary ORDER BY month DESC LIMIT ?
  `).all(limit);

  res.json(data);
});

module.exports = router;
