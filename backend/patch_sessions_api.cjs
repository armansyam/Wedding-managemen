const fs = require('fs');
let code = fs.readFileSync('/DATA/AppData/wedding-app/backend/server.js', 'utf8');

const apiToInsert = `
// ------------------------------------------------------------------
// SESSIONS API (Master Sesi)
// ------------------------------------------------------------------
app.get('/api/sessions', sessionAuth, async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM sessions ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', sessionAuth, async (req, res) => {
  const { session_name, description } = req.body;
  try {
    await dbRun("INSERT INTO sessions (session_name, description) VALUES (?, ?)", [session_name, description]);
    res.json({ message: 'Session added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sessions/:id', sessionAuth, async (req, res) => {
  const { session_name, description } = req.body;
  try {
    await dbRun("UPDATE sessions SET session_name = ?, description = ? WHERE id = ?", [session_name, description, req.params.id]);
    res.json({ message: 'Session updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', sessionAuth, async (req, res) => {
  try {
    await dbRun("DELETE FROM sessions WHERE id = ?", [req.params.id]);
    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

`;

// Insert after Audit Log API
if (!code.includes("app.get('/api/sessions'")) {
    const insertPos = code.indexOf("app.get('/api/audit'");
    if(insertPos !== -1) {
        code = code.slice(0, insertPos) + apiToInsert + code.slice(insertPos);
        fs.writeFileSync('/DATA/AppData/wedding-app/backend/server.js', code);
        console.log("Success: Injected /api/sessions endpoints.");
    } else {
        console.log("Error: Could not find /api/audit to anchor the injection.");
    }
} else {
    console.log("Already has /api/sessions.");
}
