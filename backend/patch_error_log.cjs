const fs = require('fs');
const file = '/DATA/AppData/wedding-app/backend/server.js';
let code = fs.readFileSync(file, 'utf8');

// Inject console.error ke dalam block catch di POST /api/sessions
const oldPost = `app.post('/api/sessions', sessionAuth, async (req, res) => {
  const { name, description, default_order, is_active } = req.body;
  try {
    await dbRun(
      "INSERT INTO sessions (name, description, default_order, is_active) VALUES (?, ?, ?, ?)",
      [name, description, default_order || 0, is_active !== undefined ? is_active : 1]
    );
    res.json({ message: 'Session added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`;

const newPost = `app.post('/api/sessions', sessionAuth, async (req, res) => {
  const { name, description, default_order, is_active } = req.body;
  try {
    await dbRun(
      "INSERT INTO sessions (name, description, default_order, is_active) VALUES (?, ?, ?, ?)",
      [name, description, default_order || 0, is_active !== undefined ? is_active : 1]
    );
    res.json({ message: 'Session added' });
  } catch (error) {
    console.error("[SESSIONS POST ERROR]", error);
    res.status(500).json({ error: error.message });
  }
});`;

if(code.includes(oldPost)) {
    code = code.replace(oldPost, newPost);
    fs.writeFileSync(file, code);
    console.log("Patched server.js for better logging.");
} else {
    console.log("Could not find the target block.");
}
