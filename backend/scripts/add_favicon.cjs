const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(publicDir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    
    // Check if it already has a favicon to avoid duplicates
    if (!html.includes('favicon.png')) {
        html = html.replace(/(<title>.*?<\/title>)/i, '$1\n    <link rel="icon" type="image/png" href="/image/favicon.png">');
        fs.writeFileSync(filePath, html);
        console.log(`Added favicon to ${file}`);
    }
});
console.log('Done!');
