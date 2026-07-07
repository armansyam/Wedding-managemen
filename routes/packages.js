const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all packages
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages ORDER BY price ASC').all();

  // Attach sessions + products
  for (const pkg of rows) {
    pkg.sessions = db.prepare(`
      SELECT s.id, s.name FROM package_sessions ps
      JOIN sessions s ON ps.session_id = s.id WHERE ps.package_id = ?
    `).all(pkg.id);

    pkg.products = db.prepare(`
      SELECT p.id, p.name, p.category, p.unit_cost, pp.quantity,
             (p.unit_cost * pp.quantity) AS subtotal
      FROM package_products pp
      JOIN products p ON pp.product_id = p.id WHERE pp.package_id = ?
    `).all(pkg.id);

    // Calculate modal
    const modalProducts = pkg.products.reduce((sum, p) => sum + p.subtotal, 0);

    // AVG fee per session × estimated_crew
    const crewCount = pkg.estimated_crew || 2;
    let modalJasa = 0;
    const sesiDetails = [];
    for (const s of pkg.sessions) {
      const avg = db.prepare(`
        SELECT COALESCE(AVG(fee_amount), 200000) AS avg_fee
        FROM freelancer_fees WHERE session_id = ?
      `).get(s.id);
      const subtotal = Math.round(avg.avg_fee * crewCount);
      modalJasa += subtotal;
      sesiDetails.push({ session_id: s.id, name: s.name, avg_fee: avg.avg_fee, subtotal });
    }

    pkg.modal_produk = modalProducts;
    pkg.modal_jasa = modalJasa;
    pkg.total_modal = modalProducts + modalJasa;
    pkg.margin = pkg.price - pkg.total_modal;
  }

  res.json(rows);
});

// GET single package
router.get('/:id', (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Not found' });

  pkg.sessions = db.prepare('SELECT session_id FROM package_sessions WHERE package_id = ?').all(pkg.id).map(r => r.session_id);
  pkg.products = db.prepare('SELECT product_id, quantity FROM package_products WHERE package_id = ?').all(pkg.id);

  res.json(pkg);
});

// POST create package
router.post('/', (req, res) => {
  const { name, description, price, session_ids, product_ids, estimated_crew } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = db.prepare('INSERT INTO packages (name, description, price, estimated_crew) VALUES (?, ?, ?, ?)').run(name, description || null, price || 0, estimated_crew || 2);
  const pkgId = result.lastInsertRowid;

  // Save sessions
  if (Array.isArray(session_ids)) {
    const ins = db.prepare('INSERT INTO package_sessions (package_id, session_id) VALUES (?, ?)');
    for (const sid of session_ids) ins.run(pkgId, sid);
  }

  // Save products
  if (Array.isArray(product_ids)) {
    const ins = db.prepare('INSERT INTO package_products (package_id, product_id, quantity) VALUES (?, ?, ?)');
    for (const p of product_ids) ins.run(pkgId, p.product_id, p.quantity || 1);
  }

  res.json({ id: pkgId, message: 'Package created' });
});

// PUT update package
router.put('/:id', (req, res) => {
  const { name, description, price, session_ids, product_ids, estimated_crew } = req.body;
  db.prepare("UPDATE packages SET name = ?, description = ?, price = ?, estimated_crew = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(name, description || null, price || 0, estimated_crew || 2, req.params.id);

  // Replace sessions
  if (Array.isArray(session_ids)) {
    db.prepare('DELETE FROM package_sessions WHERE package_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO package_sessions (package_id, session_id) VALUES (?, ?)');
    for (const sid of session_ids) ins.run(req.params.id, sid);
  }

  // Replace products
  if (Array.isArray(product_ids)) {
    db.prepare('DELETE FROM package_products WHERE package_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO package_products (package_id, product_id, quantity) VALUES (?, ?, ?)');
    for (const p of product_ids) ins.run(req.params.id, p.product_id, p.quantity || 1);
  }

  res.json({ message: 'Package updated' });
});

// DELETE package
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE packages SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Package deactivated' });
});

// POST calculate estimate
router.post('/calculate-estimate', (req, res) => {
  const { product_ids, session_ids, estimated_crew } = req.body;
  const crewCount = estimated_crew || 2;

  // Modal produk
  let modalProduk = 0;
  if (Array.isArray(product_ids)) {
    for (const p of product_ids) {
      const prod = db.prepare('SELECT unit_cost FROM products WHERE id = ?').get(p.product_id);
      if (prod) modalProduk += prod.unit_cost * (p.quantity || 1);
    }
  }

  // Modal jasa (AVG fee × estimated_crew per sesi)
  let modalJasa = 0;
  const detail = [];
  if (Array.isArray(session_ids)) {
    for (const sid of session_ids) {
      const avg = db.prepare('SELECT COALESCE(AVG(fee_amount), 200000) AS avg_fee, s.name FROM freelancer_fees ff JOIN sessions s ON ff.session_id = s.id WHERE ff.session_id = ?').get(sid);
      const subtotal = Math.round(avg.avg_fee * crewCount);
      modalJasa += subtotal;
      detail.push({ session_id: sid, name: avg.name, avg_fee: avg.avg_fee, subtotal });
    }
  }

  res.json({
    modal_produk: modalProduk,
    modal_jasa: modalJasa,
    total_modal: modalProduk + modalJasa,
    detail_sesi: detail,
  });
});

module.exports = router;
