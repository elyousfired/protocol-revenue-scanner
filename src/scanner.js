import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExplorerUrl } from './registry.js';
import { isProtocolTokenVerified } from './tokenFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'protocols_data.json');
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn(`[Scanner] Fetch failed (${url.slice(0, 45)}...): ${err.message}. Retry ${i+1}/${retries}...`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function scanProtocols(force = false) {
  try {
    if (!force) {
      try {
        const cachedRaw = await fs.readFile(CACHE_FILE, 'utf-8');
        const cached = JSON.parse(cachedRaw);
        if (process.env.VERCEL || (cached.lastUpdated && (Date.now() - new Date(cached.lastUpdated).getTime() < CACHE_TTL_MS))) {
          // Strictly filter to ensure no tokenless protocol slipped in
          cached.protocols = cached.protocols.filter(p => isProtocolTokenVerified(p, true));
          console.log(`[Scanner] Loaded from cache (${cached.protocols.length} verified tokenized protocols, updated at ${cached.lastUpdated})`);
          return cached;
        }
      } catch (err) {
        // Cache miss
      }
    }

    console.log('[Scanner] Scanning protocols from DefiLlama with STRICT verified native token enforcement...');

    const protocolsUrl = 'https://api.llama.fi/protocols';
    const revenueUrl = 'https://api.llama.fi/overview/fees?dataType=dailyRevenue&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
    const feesUrl = 'https://api.llama.fi/overview/fees?dataType=dailyFees&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';

    console.log('[Scanner] 1/3 Fetching protocols, addresses and market caps...');
    const allProtocolsList = await fetchWithRetry(protocolsUrl);

    console.log('[Scanner] 2/3 Fetching protocol daily & weekly revenues...');
    const revenueData = await fetchWithRetry(revenueUrl);

    console.log('[Scanner] 3/3 Fetching protocol fees...');
    const feesData = await fetchWithRetry(feesUrl);

    // 1. Build Token & Smart Contract Address Index (Strict Verification)
    const tokenMap = new Map();
    const parentMap = new Map();

    for (const p of allProtocolsList) {
      if (!isProtocolTokenVerified(p, true)) {
        continue;
      }

      let rawAddress = p.address ? p.address.trim() : null;
      let cleanAddress = null;
      let addressChain = p.chain || (p.chains && p.chains[0]) || 'Ethereum';

      if (rawAddress) {
        const parts = rawAddress.split(':');
        if (parts.length > 1) {
          addressChain = parts[0];
          cleanAddress = parts[1];
        } else {
          cleanAddress = parts[0];
        }
      }

      const explorerUrl = cleanAddress ? getExplorerUrl(addressChain, cleanAddress) : null;

      const info = {
        symbol: p.symbol.toUpperCase().trim(),
        gecko_id: p.gecko_id || null,
        name: p.name,
        slug: p.slug,
        category: p.category,
        mcap: p.mcap || 0,
        contractAddress: cleanAddress,
        addressChain: addressChain,
        explorerUrl: explorerUrl
      };

      if (p.id) tokenMap.set(String(p.id), info);
      if (p.slug) tokenMap.set(p.slug.toLowerCase(), info);
      if (p.name) tokenMap.set(p.name.toLowerCase(), info);

      if (p.slug) {
        parentMap.set(p.slug.toLowerCase(), info);
      }
      if (p.parentProtocol) {
        const parentSlug = p.parentProtocol.replace('parent#', '').toLowerCase();
        if (!parentMap.has(parentSlug) || (info.mcap > 0 && parentMap.get(parentSlug).mcap === 0)) {
          parentMap.set(parentSlug, info);
        }
      }
    }

    // Inherit market cap from parent protocols or sister versions
    for (const p of allProtocolsList) {
      if (p.parentProtocol && p.mcap && p.mcap > 0) {
        const parentSlug = p.parentProtocol.replace('parent#', '').toLowerCase();
        const existing = parentMap.get(parentSlug);
        if (existing) {
          if (existing.mcap === 0) existing.mcap = p.mcap;
          if (!existing.contractAddress && p.address) {
            existing.contractAddress = p.address;
          }
        }
      }
    }

    const feesMap = new Map();
    for (const f of feesData.protocols || []) {
      const key = f.slug || f.defillamaId || f.name;
      if (key) feesMap.set(key, f);
    }

    const protocols = [];
    const chainRevenueMap = {};
    const categoryRevenueMap = {};
    let totalWeeklyRevenue = 0;
    let totalMcapTracked = 0;

    for (const p of revenueData.protocols || []) {
      // 1. Strict check: skip known tokenless or CEX/Chain/Foundation entities
      if (!isProtocolTokenVerified(p, false)) {
        continue;
      }

      const keyId = p.defillamaId ? String(p.defillamaId) : (p.id ? String(p.id) : null);
      const keySlug = p.slug ? p.slug.toLowerCase() : null;
      const keyName = p.name ? p.name.toLowerCase() : null;
      const parentSlug = p.parentProtocol ? p.parentProtocol.replace('parent#', '').toLowerCase() : null;

      let token = (keyId && tokenMap.get(keyId)) || 
                  (keySlug && tokenMap.get(keySlug)) || 
                  (keyName && tokenMap.get(keyName)) ||
                  (parentSlug && parentMap.get(parentSlug));

      if (!token && keySlug) {
        const baseSlug = keySlug.replace(/-v[0-9]+.*$/, '').replace(/-dex$/, '').replace(/-perps$/, '').replace(/-slipstream$/, '');
        token = tokenMap.get(baseSlug) || parentMap.get(baseSlug);
      }
      if (!token && keyName) {
        const baseName = keyName.replace(/ v[0-9]+.*$/i, '').replace(/ dex$/i, '').replace(/ perps$/i, '');
        token = tokenMap.get(baseName);
      }

      // If token not found or fails strict verification, exclude protocol!
      if (!token || !token.symbol || !isProtocolTokenVerified(token, true)) {
        continue;
      }

      const rev7d = typeof p.total7d === 'number' ? p.total7d : 0;
      const rev24h = typeof p.total24h === 'number' ? p.total24h : 0;
      const rev30d = typeof p.total30d === 'number' ? p.total30d : 0;
      const revAllTime = typeof p.totalAllTime === 'number' ? p.totalAllTime : 0;

      const feeObj = feesMap.get(p.slug || p.defillamaId || p.name);
      const fees24h = feeObj && typeof feeObj.total24h === 'number' ? feeObj.total24h : rev24h;

      const mcap = token.mcap || 0;
      const annualizedRevenue = rev7d > 0 ? (rev7d * 52) : (rev24h * 365);
      
      const weeklyYieldMc = mcap > 0 && annualizedRevenue > 0
        ? Math.round(((annualizedRevenue / mcap) * 100) * 10) / 10
        : 0;

      const peRatio = mcap > 0 && annualizedRevenue > 0
        ? Math.round((mcap / annualizedRevenue) * 10) / 10
        : null;

      const name = p.displayName || p.name || 'Unnamed Protocol';
      const category = p.category || token.category || 'Other';
      const chains = Array.isArray(p.chains) && p.chains.length > 0 ? p.chains : ['Multi-Chain'];

      totalWeeklyRevenue += rev7d;
      totalMcapTracked += mcap;

      categoryRevenueMap[category] = (categoryRevenueMap[category] || 0) + rev7d;
      for (const chain of chains) {
        chainRevenueMap[chain] = (chainRevenueMap[chain] || 0) + (rev7d / chains.length);
      }

      protocols.push({
        id: p.id || p.defillamaId || p.slug || name,
        slug: p.slug,
        name: name,
        tokenSymbol: token.symbol,
        geckoId: token.gecko_id,
        contractAddress: token.contractAddress || null,
        explorerUrl: token.explorerUrl || null,
        addressChain: token.addressChain || null,
        mcap: mcap,
        weeklyYieldMc: weeklyYieldMc,
        peRatio: peRatio,
        annualizedRevenue: Math.round(annualizedRevenue),
        category: category,
        chains: chains,
        logo: p.logo || null,
        revenue7d: rev7d,
        revenue24h: rev24h,
        revenue30d: rev30d,
        revenueAllTime: revAllTime,
        fees24h: fees24h,
        takeRate: fees24h > 0 ? Math.min(100, Math.round((rev24h / fees24h) * 100)) : 100,
        change1d: typeof p.change_1d === 'number' ? p.change_1d : null,
        change7d: typeof p.change_7d === 'number' ? p.change_7d : null,
        methodology: p.methodology?.Revenue || p.methodology?.ProtocolRevenue || null,
        hasBreakdown: !!p.breakdown24h,
        breakdown24h: p.breakdown24h || null
      });
    }

    protocols.sort((a, b) => (b.revenue7d || 0) - (a.revenue7d || 0));

    const topChains = Object.entries(chainRevenueMap)
      .map(([chain, revenue]) => ({ chain, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const topCategories = Object.entries(categoryRevenueMap)
      .map(([category, revenue]) => ({ category, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const result = {
      lastUpdated: new Date().toISOString(),
      primaryMetric: 'Weekly Yield / MC %',
      stats: {
        totalProtocols: protocols.length,
        withContractAddressCount: protocols.filter(p => p.contractAddress).length,
        withYieldCount: protocols.filter(p => p.weeklyYieldMc > 0).length,
        totalWeeklyRevenue: Math.round(totalWeeklyRevenue),
        totalMcapTracked: Math.round(totalMcapTracked)
      },
      topChains,
      topCategories,
      protocols
    };

    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(result, null, 2), 'utf-8');
    } catch {
      // Ignore read-only filesystem warning in serverless environments
    }
    console.log(`[Scanner] Successfully indexed ${protocols.length} strictly verified tokenized protocols!`);

    return result;
  } catch (err) {
    console.error('[Scanner] Scan error:', err);
    try {
      const cachedRaw = await fs.readFile(CACHE_FILE, 'utf-8');
      return JSON.parse(cachedRaw);
    } catch {
      throw err;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scanProtocols(true).then((data) => {
    console.log(`Scan completed: ${data.protocols.length} protocols scanned.`);
    console.log(`Protocols with smart contract address: ${data.stats.withContractAddressCount}`);
  }).catch((err) => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
}
