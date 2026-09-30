const fs = require('fs');
let code = fs.readFileSync('src/bybitWatcher.js', 'utf-8');

const fetchLogicOld = 'scanProtocols()';
const fetchLogicNew = `scanProtocols(),
    (async () => {
      const CG_CACHE_FILE = './cache/cg_mcap.json';
      const TMP_CG_CACHE_FILE = '/tmp/cg_mcap.json';
      let cgCache = null;
      for (const file of [TMP_CG_CACHE_FILE, CG_CACHE_FILE]) {
        try {
          const raw = await fs.promises.readFile(file, 'utf-8');
          const data = JSON.parse(raw);
          if (data && data.timestamp && Date.now() - data.timestamp < 4 * 60 * 60 * 1000) {
            cgCache = data.map;
            break;
          }
        } catch {}
      }
      if (!cgCache) {
        console.log('[BybitWatcher] Fetching fresh CoinGecko Top 1000 Market Caps...');
        cgCache = {};
        try {
          for(let page = 1; page <= 4; page++) {
            const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=' + page);
            if(!res.ok) break;
            const coins = await res.json();
            for(const c of coins) {
              if (c.symbol && c.market_cap) {
                cgCache[c.symbol.toUpperCase()] = c.market_cap;
              }
            }
            await new Promise(r => setTimeout(r, 2000));
          }
          const cacheData = { timestamp: Date.now(), map: cgCache };
          await fs.promises.writeFile(TMP_CG_CACHE_FILE, JSON.stringify(cacheData)).catch(()=>{});
        } catch(e) {
          console.error('[BybitWatcher] CoinGecko fetch failed:', e.message);
        }
      }
      return cgCache || {};
    })()`;

code = code.replace(fetchLogicOld, fetchLogicNew);
code = code.replace('const [bybitRes, scannerData] = await', 'const [bybitRes, scannerData, cgMap] = await');
fs.writeFileSync('src/bybitWatcher.js', code);
