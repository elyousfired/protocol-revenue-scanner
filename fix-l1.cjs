const fs = require('fs');

let code = fs.readFileSync('src/bybitWatcher.js', 'utf-8');

// Replace the weird L1s
code = code.replace(/A: 'l1', /g, '');
code = code.replace(/S: 'l1', /g, '');
code = code.replace(/SOMI: 'l1', /g, '');
code = code.replace(/CC: 'l1', /g, '');
code = code.replace(/STABLE: 'l1', /g, '');

code = code.replace(/GRAM: 'l1'/g, "GRAM: 'memes'");
code = code.replace(/MON: 'l1'/g, "MON: 'gaming'");
code = code.replace(/MOVE: 'l1'/g, "MOVE: 'l2'");
code = code.replace(/LAYER: 'l1'/g, "LAYER: 'l2'");

// Fix the fallback logic in classifyTokenCategory
const fallbackLogicOriginal = `    // Check our verified DeFi/Protocol scanner registry
    const proto = scannerMap.get(upper);
    if (proto && proto.category) {
      const c = proto.category.toLowerCase();
      if (c.includes('dex') || c.includes('lending') || c.includes('yield') || c.includes('liquid') || c.includes('derivatives') || c.includes('cdp') || c.includes('Synthetics')) return 'defi';
      if (c.includes('launchpad')) return 'launchpad';
      if (c.includes('rwa') || c.includes('payment')) return 'rwa';
      if (c.includes('gaming') || c.includes('nft')) return 'gaming';
      if (c.includes('ai')) return 'ai';
      if (c.includes('chain')) return 'l1';
      if (c.includes('bridge') || c.includes('oracle')) return 'infra';
    }`;

const fallbackLogicFixed = `    // Check our verified DeFi/Protocol scanner registry
    const proto = scannerMap.get(upper);
    if (proto && proto.category) {
      const c = proto.category.toLowerCase();
      if (c.includes('dex') || c.includes('lending') || c.includes('yield') || c.includes('liquid') || c.includes('derivatives') || c.includes('cdp') || c.includes('synthetics') || c.includes('farm')) return 'defi';
      if (c.includes('launchpad')) return 'launchpad';
      if (c.includes('rwa') || c.includes('payment')) return 'rwa';
      if (c.includes('gaming') || c.includes('nft') || c.includes('metaverse')) return 'gaming';
      if (c.includes('ai') || c.includes('agent')) return 'ai';
      if (c.includes('bridge') || c.includes('oracle') || c.includes('infra')) return 'infra';
      // Only classify as L1 if the category is specifically "chain" and not "cross chain" or "app chain" etc
      if (c === 'chain' || c.includes('layer 1')) return 'l1';
      if (c.includes('rollup') || c.includes('layer 2')) return 'l2';
    }`;

code = code.replace(fallbackLogicOriginal, fallbackLogicFixed);

fs.writeFileSync('src/bybitWatcher.js', code);
console.log('Fixed L1 classifications!');
