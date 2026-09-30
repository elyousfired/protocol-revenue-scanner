const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf-8');

html = html.replace(/border-amber-500\/40/g, 'border-cyan-500/30');
html = html.replace(/from-\[\#17130a\]\/95 via-\[\#0f172a\]\/95 to-\[\#0c1322\]\/95/g, 'from-[#0c1a2e] via-[#091322] to-[#070c16]');
html = html.replace(/bg-amber-500\/20 text-amber-300/g, 'bg-cyan-500/20 text-cyan-300');
html = html.replace(/bg-amber-400 text-black/g, 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50');
html = html.replace(/bg-amber-500\/15 border-amber-400 shadow-lg shadow-amber-500\/10/g, 'bg-cyan-500/15 border-cyan-400 shadow-lg shadow-cyan-500/10');
html = html.replace(/hover:border-amber-500\/40/g, 'hover:border-cyan-500/40');
html = html.replace(/text-amber-300\/90/g, 'text-cyan-300/90');
html = html.replace(/text-amber-400/g, 'text-cyan-400');
html = html.replace(/text-amber-500/g, 'text-cyan-500');
html = html.replace(/from-amber-400 to-cyan-400/g, 'from-cyan-400 to-blue-600');
html = html.replace(/bg-amber-500\/10 border border-amber-500\/30/g, 'bg-cyan-500/10 border border-cyan-500/30');
html = html.replace(/from-amber-400 via-emerald-400 to-cyan-400/g, 'from-cyan-400 via-blue-500 to-purple-500');
html = html.replace(/from-amber-500 to-rose-500/g, 'from-blue-500 to-purple-500');

// specifically for the top banner toggle
html = html.replace(/bg-amber-400/g, 'bg-cyan-500'); 
html = html.replace(/shadow-amber-500/g, 'shadow-cyan-500');

fs.writeFileSync('public/index.html', html);
console.log('Done!');
