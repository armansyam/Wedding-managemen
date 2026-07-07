const express = require('express');
const router = express.Router();
const db = require('../db');

// GET analytics insights
router.get('/insights', (req, res) => {
  const { year } = req.query;
  const currentYear = year || new Date().getFullYear().toString();

  // 1. Conversion Funnel (Leads Status Breakdown)
  const leadsCount = db.prepare(`SELECT COUNT(*) AS total FROM leads`).get().total || 0;
  const newLeads = db.prepare(`SELECT COUNT(*) AS total FROM leads WHERE status = 'new'`).get().total || 0;
  const contacted = db.prepare(`SELECT COUNT(*) AS total FROM leads WHERE status = 'contacted'`).get().total || 0;
  const interested = db.prepare(`SELECT COUNT(*) AS total FROM leads WHERE status = 'interested'`).get().total || 0;
  const booked = db.prepare(`SELECT COUNT(*) AS total FROM leads WHERE status = 'booked'`).get().total || 0;
  const lost = db.prepare(`SELECT COUNT(*) AS total FROM leads WHERE status = 'lost'`).get().total || 0;

  const conversionRate = leadsCount > 0 ? Math.round((booked / leadsCount) * 100) : 0;

  // 2. Lead Sources Analysis (e.g. Instagram, TikTok, WhatsApp, Website, etc.)
  const sources = db.prepare(`
    SELECT COALESCE(NULLIF(source, ''), 'Lainnya') AS source_name, COUNT(*) AS count
    FROM leads
    GROUP BY source_name
    ORDER BY count DESC
  `).all();

  // 3. Monthly Booking Seasonal Trend (Peak wedding seasons count)
  const monthlyBookings = [];
  for (let m = 1; m <= 12; m++) {
    const monthPrefix = `${currentYear}-${String(m).padStart(2, '0')}`;
    const count = db.prepare(`
      SELECT COUNT(*) AS count FROM bookings
      WHERE strftime('%Y-%m', event_date) = ? AND status != 'cancelled'
    `).get(monthPrefix).count || 0;

    monthlyBookings.push({
      monthNum: m,
      monthName: new Date(currentYear, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' }),
      count
    });
  }

  // 4. Package Margin and Efficiency Comparison
  const packagesPerformance = db.prepare(`
    SELECT id, name, price FROM packages WHERE is_active = 1
  `).all();

  const pkgInsights = [];
  for (const pkg of packagesPerformance) {
    // Count successful/completed bookings
    const count = db.prepare(`
      SELECT COUNT(*) AS count FROM bookings WHERE package_id = ? AND status != 'cancelled'
    `).get(pkg.id).count || 0;

    // Get average product cost for this package
    const productCost = db.prepare(`
      SELECT COALESCE(SUM(pp.quantity * p.unit_cost), 0) AS total
      FROM package_products pp
      JOIN products p ON pp.product_id = p.id
      WHERE pp.package_id = ?
    `).get(pkg.id).total || 0;

    // Get average freelancer fee cost for this package
    const sessions = db.prepare(`
      SELECT session_id FROM package_sessions WHERE package_id = ?
    `).all(pkg.id);

    let averageCrewCost = 0;
    const crewMultiplier = pkg.estimated_crew || 2; // dynamically read per-package estimated crew count!
    for (const s of sessions) {
      const avgFee = db.prepare(`
        SELECT COALESCE(AVG(fee_amount), 200000) AS avg_fee FROM freelancer_fees WHERE session_id = ?
      `).get(s.session_id).avg_fee || 200000;
      averageCrewCost += Math.round(avgFee * crewMultiplier);
    }

    const totalCost = productCost + averageCrewCost;
    const marginAmount = pkg.price - totalCost;
    const marginPercent = pkg.price > 0 ? Math.round((marginAmount / pkg.price) * 100) : 0;

    pkgInsights.push({
      id: pkg.id,
      name: pkg.name,
      price: pkg.price,
      bookingsCount: count,
      productCost,
      crewCost: averageCrewCost,
      totalCost,
      marginAmount,
      marginPercent
    });
  }

  res.json({
    conversion: {
      total: leadsCount,
      newLeads,
      contacted,
      interested,
      booked,
      lost,
      rate: conversionRate
    },
    sources,
    monthlyTrends: {
      year: currentYear,
      data: monthlyBookings
    },
    packages: pkgInsights
  });
});

module.exports = router;
