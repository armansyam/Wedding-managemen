const express = require('express');
const router = express.Router();
const db = require('../db');

// ── Helper: get kas summary ─────────────────────────────────────────────────
function getKasSummary() {
  // Total kas masuk = semua pembayaran terverifikasi (DP + pelunasan dari tabel payments)
  const masuk = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'verified'
  `).get();

  // Total kas keluar = fee kru yang sudah dibayarkan
  const keluarKru = db.prepare(`
    SELECT COALESCE(SUM(fee_amount), 0) AS total
    FROM booking_session_crew WHERE is_paid = 1
  `).get();

  // Total dividen yang sudah ditarik
  const dividen = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM dividends
  `).get();

  // Min kas operasional dari settings
  const minKasSetting = db.prepare(`SELECT value FROM settings WHERE key = 'min_kas_operasional'`).get();
  const minKas = parseInt(minKasSetting?.value || '0');

  const totalMasuk = masuk.total;
  const totalKeluar = keluarKru.total;
  const totalDividen = dividen.total;
  const kasTersedia = totalMasuk - totalKeluar - totalDividen;
  const maxDividen = Math.max(0, kasTersedia - minKas);

  return { totalMasuk, totalKeluar, totalDividen, kasTersedia, minKas, maxDividen };
}

// GET /api/reports/kas — saldo kas & dividen summary
router.get('/kas', (req, res) => {
  res.json(getKasSummary());
});

// GET /api/reports/pl?month=2026-07 — Laba Rugi per bulan atau semua
router.get('/pl', (req, res) => {
  const { month, year } = req.query;

  let dateFilter = '';
  let params = [];
  if (month) {
    dateFilter = `AND strftime('%Y-%m', p.payment_date) = ?`;
    params.push(month);
  } else if (year) {
    dateFilter = `AND strftime('%Y', p.payment_date) = ?`;
    params.push(year);
  }

  // Pendapatan per tipe (dp / pelunasan)
  const pendapatan = db.prepare(`
    SELECT type, SUM(amount) AS total, COUNT(*) AS count
    FROM payments p WHERE status = 'verified' ${dateFilter}
    GROUP BY type
  `).all(...params);

  // Biaya kru (berdasarkan tanggal paid_at)
  let kruFilter = '';
  let kruParams = [];
  if (month) {
    kruFilter = `AND strftime('%Y-%m', bsc.paid_at) = ?`;
    kruParams.push(month);
  } else if (year) {
    kruFilter = `AND strftime('%Y', bsc.paid_at) = ?`;
    kruParams.push(year);
  }

  const biayaKru = db.prepare(`
    SELECT COALESCE(SUM(bsc.fee_amount), 0) AS total
    FROM booking_session_crew bsc
    WHERE bsc.is_paid = 1 ${kruFilter}
  `).get(...kruParams);

  // Modal produk (estimasi dari paket di booking selesai)
  let produkFilter = '';
  let produkParams = [];
  if (month) {
    produkFilter = `AND strftime('%Y-%m', b.updated_at) = ?`;
    produkParams.push(month);
  } else if (year) {
    produkFilter = `AND strftime('%Y', b.updated_at) = ?`;
    produkParams.push(year);
  }

  const modalProduk = db.prepare(`
    SELECT COALESCE(SUM(pp.quantity * pr.unit_cost), 0) AS total
    FROM bookings b
    JOIN package_products pp ON pp.package_id = b.package_id
    JOIN products pr ON pr.id = pp.product_id
    WHERE b.status = 'completed' ${produkFilter}
  `).get(...produkParams);

  // Dividen di periode ini
  let dividenFilter = '';
  let dividenParams = [];
  if (month) {
    dividenFilter = `WHERE strftime('%Y-%m', date) = ?`;
    dividenParams.push(month);
  } else if (year) {
    dividenFilter = `WHERE strftime('%Y', date) = ?`;
    dividenParams.push(year);
  }

  const dividenPeriod = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM dividends ${dividenFilter}
  `).get(...dividenParams);

  const totalPendapatan = pendapatan.reduce((s, p) => s + p.total, 0);
  const totalBiayaKru = biayaKru.total;
  const totalModalProduk = modalProduk.total;
  const totalBeban = totalBiayaKru + totalModalProduk;
  const labaBersih = totalPendapatan - totalBeban;

  res.json({
    pendapatan,
    totalPendapatan,
    biaya: {
      kru: totalBiayaKru,
      produk: totalModalProduk,
      total: totalBeban
    },
    dividen: dividenPeriod.total,
    labaBersih,
    margin: totalPendapatan > 0 ? Math.round((labaBersih / totalPendapatan) * 100) : 0
  });
});

// GET /api/reports/pl-monthly?year=2026 — P&L per bulan dalam 1 tahun (grafik)
router.get('/pl-monthly', (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const months = [];

  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;

    const pendapatan = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE status = 'verified' AND strftime('%Y-%m', payment_date) = ?
    `).get(monthStr);

    const biayaKru = db.prepare(`
      SELECT COALESCE(SUM(fee_amount), 0) AS total
      FROM booking_session_crew WHERE is_paid = 1 AND strftime('%Y-%m', paid_at) = ?
    `).get(monthStr);

    const dividen = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM dividends
      WHERE strftime('%Y-%m', date) = ?
    `).get(monthStr);

    const totalPendapatan = pendapatan.total;
    const totalBeban = biayaKru.total;
    const laba = totalPendapatan - totalBeban;

    months.push({
      month: monthStr,
      label: new Date(year, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' }),
      pendapatan: totalPendapatan,
      beban: totalBeban,
      laba,
      dividen: dividen.total
    });
  }

  res.json({ year, months });
});

// GET /api/reports/receivables — piutang (booking belum lunas)
router.get('/receivables', (req, res) => {
  const rows = db.prepare(`
    SELECT b.id, b.event_date, b.status, b.package_price, b.additional_income,
           c.name AS client_name, c.phone AS client_phone,
           pkg.name AS package_name,
           COALESCE(SUM(p.amount), 0) AS total_paid,
           (b.package_price + COALESCE(b.additional_income, 0)) - COALESCE(SUM(p.amount), 0) AS outstanding
    FROM bookings b
    JOIN clients c ON b.client_id = c.id
    LEFT JOIN packages pkg ON b.package_id = pkg.id
    LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'verified'
    WHERE b.status IN ('confirmed', 'in_progress', 'event_day', 'editing', 'delivery')
    GROUP BY b.id
    HAVING outstanding > 0
    ORDER BY b.event_date ASC
  `).all();

  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  res.json({ rows, total, count: rows.length });
});

// GET /api/reports/payables — kewajiban ke kru aktif
router.get('/payables', (req, res) => {
  const rows = db.prepare(`
    SELECT f.id AS freelancer_id, f.name, f.skill, f.phone, f.bank_account,
           COUNT(bsc.id) AS unpaid_jobs,
           SUM(bsc.fee_amount) AS total_unpaid
    FROM booking_session_crew bsc
    JOIN freelancers f ON bsc.freelancer_id = f.id
    JOIN booking_sessions bs ON bsc.booking_session_id = bs.id
    JOIN bookings b ON bs.booking_id = b.id
    WHERE bsc.is_paid = 0
      AND b.status IN ('confirmed','in_progress','event_day')
    GROUP BY f.id
    ORDER BY total_unpaid DESC
  `).all();

  const total = rows.reduce((s, r) => s + r.total_unpaid, 0);
  res.json({ rows, total, count: rows.length });
});

// GET /api/reports/packages — performa paket
router.get('/packages', (req, res) => {
  const rows = db.prepare(`
    SELECT pkg.id, pkg.name, pkg.price AS harga_paket,
           COUNT(b.id) AS jumlah_booking,
           SUM(CASE WHEN b.status IN ('completed') THEN 1 ELSE 0 END) AS selesai,
           COALESCE(SUM(p.amount), 0) AS total_revenue
    FROM packages pkg
    LEFT JOIN bookings b ON b.package_id = pkg.id
      AND b.status NOT IN ('cancelled')
    LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'verified'
    WHERE pkg.is_active = 1
    GROUP BY pkg.id
    ORDER BY total_revenue DESC
  `).all();

  res.json(rows);
});

// GET /api/reports/cashflow?month=2026-07 — arus kas (incoming vs outgoing timeline)
router.get('/cashflow', (req, res) => {
  const { month, year } = req.query;
  let filter = '';
  let params = [];
  if (month) { filter = `AND strftime('%Y-%m', payment_date) = ?`; params.push(month); }
  else if (year) { filter = `AND strftime('%Y', payment_date) = ?`; params.push(year); }

  const incoming = db.prepare(`
    SELECT p.payment_date AS date, p.amount, p.type, p.payment_method AS method,
           c.name AS client_name, b.id AS booking_id
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    WHERE p.status = 'verified' ${filter}
    ORDER BY p.payment_date DESC
  `).all(...params);

  let krufilt = '';
  let kruparams = [];
  if (month) { krufilt = `AND strftime('%Y-%m', bsc.paid_at) = ?`; kruparams.push(month); }
  else if (year) { krufilt = `AND strftime('%Y', bsc.paid_at) = ?`; kruparams.push(year); }

  const outgoing = db.prepare(`
    SELECT bsc.paid_at AS date, bsc.fee_amount AS amount, 'crew_fee' AS type,
           f.name AS freelancer_name, f.skill
    FROM booking_session_crew bsc
    JOIN freelancers f ON bsc.freelancer_id = f.id
    WHERE bsc.is_paid = 1 ${krufilt}
    ORDER BY bsc.paid_at DESC
  `).all(...kruparams);

  const totalIn = incoming.reduce((s, r) => s + r.amount, 0);
  const totalOut = outgoing.reduce((s, r) => s + r.amount, 0);

  res.json({ incoming, outgoing, totalIn, totalOut, netFlow: totalIn - totalOut });
});

module.exports = router;
