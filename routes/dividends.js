const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dividends — list semua riwayat dividen
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM dividends ORDER BY date DESC, created_at DESC
  `).all();
  const totalTarik = rows.reduce((s, r) => s + r.amount, 0);
  res.json({ rows, totalTarik });
});

// POST /api/dividends — tarik dividen baru
router.post('/', (req, res) => {
  const { amount, date, description, method } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Nominal harus > 0' });
  if (!date) return res.status(400).json({ error: 'Tanggal wajib diisi' });

  // Hitung kas tersedia saat ini
  const masuk = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='verified'`).get();
  const kru = db.prepare(`SELECT COALESCE(SUM(fee_amount),0) AS total FROM booking_session_crew WHERE is_paid=1`).get();
  const divTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM dividends`).get();
  const minKasSetting = db.prepare(`SELECT value FROM settings WHERE key='min_kas_operasional'`).get();
  const minKas = parseInt(minKasSetting?.value || '0');

  const kasTersedia = masuk.total - kru.total - divTotal.total;
  const maxDividen = kasTersedia - minKas;

  if (amount > maxDividen) {
    return res.status(400).json({
      error: `Nominal melebihi batas. Kas tersedia: Rp ${kasTersedia.toLocaleString('id-ID')}, Min. operasional: Rp ${minKas.toLocaleString('id-ID')}, Maks. dividen: Rp ${maxDividen.toLocaleString('id-ID')}`
    });
  }

  const result = db.prepare(`
    INSERT INTO dividends (amount, date, description, method) VALUES (?, ?, ?, ?)
  `).run(amount, date, description || null, method || 'Transfer');

  res.json({ id: result.lastInsertRowid, message: 'Dividen dicatat', kasTersediaSetelah: kasTersedia - amount });
});

// DELETE /api/dividends/:id — hapus entri dividen
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM dividends WHERE id = ?').run(req.params.id);
  res.json({ message: 'Entri dividen dihapus' });
});

module.exports = router;
