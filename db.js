const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbFilename = process.env.DB_FILENAME || 'sorehari.db';
const dbPath = path.join(dbDir, dbFilename);
const db = new Database(dbPath);

// Performance: WAL mode + foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
