const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'data', 'wedding.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT * FROM settings WHERE key LIKE 'wa_%' OR key = 'vendor_name'").all();
console.log(JSON.stringify(rows, null, 2));
