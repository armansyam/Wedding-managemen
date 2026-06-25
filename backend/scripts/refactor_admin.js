const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '../public/admin.html');
const cssPath = path.join(__dirname, '../public/css/admin.css');
const jsPath = path.join(__dirname, '../public/js/admin.js');

let html = fs.readFileSync(adminPath, 'utf8');

// Extract CSS
const styleRegex = /<style>([\s\S]*?)<\/style>/;
const styleMatch = html.match(styleRegex);
if (styleMatch) {
    fs.writeFileSync(cssPath, styleMatch[1].trim());
    html = html.replace(styleRegex, '<link rel="stylesheet" href="/css/admin.css">');
}

// Extract JS
const scriptRegex = /<script>\s*\n([\s\S]*?)<\/script>\s*<\/body>/;
const scriptMatch = html.match(scriptRegex);
if (scriptMatch) {
    fs.writeFileSync(jsPath, scriptMatch[1].trim());
    html = html.replace(scriptRegex, '<script src="/js/admin.js"></script>\n</body>');
}

fs.writeFileSync(adminPath, html);
console.log('Refactoring complete!');
