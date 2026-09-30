const fs = require('fs');
let s = fs.readFileSync('src/server.js', 'utf-8');
s = s.replace(
  /res\.writeHead\(200, \{ 'Content-Type': contentType \}\);/,
  "res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600' });"
);
fs.writeFileSync('src/server.js', s);
console.log('Fixed cache control');
