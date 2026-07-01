const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all products
router.get('/', (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM products WHERE is_active = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY category, name';
  res.json(db.prepare(sql).all(...params));
});

// POST create product
router.post('/', (req, res) => {
  const { name, category, unit_cost, unit, description } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });
  if (!['fisik', 'digital'].includes(category)) return res.status(400).json({ error: 'category must be fisik or digital' });
  const result = db.prepare('INSERT INTO products (name, category, unit_cost, unit, description) VALUES (?, ?, ?, ?, ?)').run(name, category, unit_cost || 0, unit || 'pcs', description || null);
  res.json({ id: result.lastInsertRowid, message: 'Product created' });
});

// PUT update product
router.put('/:id', (req, res) => {
  const { name, category, unit_cost, unit, description } = req.body;
  db.prepare("UPDATE products SET name = ?, category = ?, unit_cost = ?, unit = ?, description = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(name, category, unit_cost || 0, unit || 'pcs', description || null, req.params.id);
  res.json({ message: 'Product updated' });
});

// DELETE product (soft)
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Product deactivated' });
});

module.exports = router;
