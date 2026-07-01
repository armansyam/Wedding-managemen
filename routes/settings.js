const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');

// GET all settings
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings ORDER BY key ASC').all();
  // Convert to key-value object
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// PUT update settings (batch)
router.put('/', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Invalid data' });

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'vendor_logo' && String(v).startsWith('data:image/')) {
        try {
          const base64Data = String(v).replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          const logoPath = path.join(__dirname, '../public/logo.png');
          fs.writeFileSync(logoPath, buffer);
          upsert.run(k, '/logo.png');
        } catch (err) {
          console.error('Failed to save vendor logo:', err);
          upsert.run(k, String(v));
        }
      } else {
        upsert.run(k, String(v));
      }
    }
  });
  tx();

  // Return updated settings
  const rows = db.prepare('SELECT * FROM settings ORDER BY key ASC').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// GET single setting
router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Setting not found' });
  res.json(row);
});

module.exports = router;
