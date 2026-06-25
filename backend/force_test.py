import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

node_script = """
import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./sorehari.db', sqlite3.OPEN_READWRITE);
db.run("INSERT INTO sessions (name, description, default_order, is_active) VALUES (?, ?, ?, ?)", ['Test Sesi', 'Test', 1, 1], function(err) {
  if (err) console.error("SQLITE ERROR:", err);
  else console.log("SUCCESS, ID:", this.lastID);
  db.close();
});
"""

child.sendline('cat << \'EOF_NODE\' > /DATA/AppData/wedding-app/test_insert.js\n' + node_script + '\nEOF_NODE')
child.expect('\$')

child.sendline('docker cp /DATA/AppData/wedding-app/test_insert.js sorehari-app:/app/backend/test_insert.js')
child.expect('\$')

child.sendline('docker exec sorehari-app node test_insert.js')
child.expect('\$')
print("=== SQL TEST ===")
print(child.before)

child.sendline('exit')
