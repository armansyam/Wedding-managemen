// WA template helpers — {{variable}} rendering + #section block helper
const db = require('../db');

// Render template with vars. Supports {{#key}}...{{/key}} sections.
function renderWATemplate(tpl, vars) {
  // Conditional section: {{#key}}content{{/key}} — rendered only if vars[key] is truthy
  tpl = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, key, content) => {
    if (!vars[key]) return '';
    // Replace {{key}} references inside the section content
    return content.replace(/\{\{(\w+)\}\}/g, (m2, k) => vars[k] !== undefined ? String(vars[k]) : m2);
  });
  // Replace remaining {{variable}} tokens
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] !== undefined ? String(vars[k]) : m);
}

function getTemplate(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : '';
}

module.exports = { renderWATemplate, getTemplate };
