const fs = require('fs');
let c = fs.readFileSync('src/bybitWatcher.js', 'utf-8');

c = c.replace(/BREV: 'l2', /g, '');
c = c.replace(/PROVE: 'l2', /g, '');
c = c.replace(/LA: 'l2', /g, '');
c = c.replace(/ZAMA: 'l2', /g, '');
c = c.replace(/ZEN: 'l2'/g, "ZEN: 'l1'");

c = c.replace(/MEGA: 'l2', /g, ''); // Mega dice is not l2
c = c.replace(/ZKC: 'l2', /g, ''); 
c = c.replace(/ZKP: 'l2', /g, ''); 
c = c.replace(/ZKJ: 'l2', /g, ''); 

fs.writeFileSync('src/bybitWatcher.js', c);
