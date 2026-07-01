const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'sorehari.db');
const db = new Database(dbPath);

// Performance: WAL mode + foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
