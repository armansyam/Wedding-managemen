const fs = require('fs');
const file = '/DATA/AppData/wedding-app/backend/server.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Ganti dbRun menjadi runAsync di POST, PUT, DELETE sessions
code = code.replace(/await dbRun\(/g, "await runAsync(");

// 2. Ganti dbAll menjadi allAsync di GET sessions (ini juga typo saya tadi)
code = code.replace(/await dbAll\(/g, "await allAsync(");

fs.writeFileSync(file, code);
console.log("Patched dbRun -> runAsync and dbAll -> allAsync.");
