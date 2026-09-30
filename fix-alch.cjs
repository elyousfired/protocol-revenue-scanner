const fs = require('fs');
let c = fs.readFileSync('src/bybitWatcher.js', 'utf-8');
c = c.replace(/ALC'0G': 'ai'/g, "ALCH: 'ai', '0G': 'ai'");
fs.writeFileSync('src/bybitWatcher.js', c);
console.log('Fixed ALCH syntax error!');
