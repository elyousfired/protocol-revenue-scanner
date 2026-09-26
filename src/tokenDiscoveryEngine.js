import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtocolTokenVerified, EXCLUDE_SLUGS } from './tokenFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DISCOVERED_CACHE_FILE = path.join(CACHE_DIR, 'discovered_tokens.json');
const DISCOVERY_TTL_MS = 30 * 60 * 1000; // 30 minutes metadata cache

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SUI_RPC = 'https://mainnet.sui.rpcpool.com';

// Canonical token max-supply caps used across SPL & Sui Move standards when mint authority is capped/revoked
const CANONICAL_CAPS = [
  100_000_000_000_000,
  10_000_000_000,
  2_000_000_000,
  1_000_000_000,
  500_000_000,
  250_000_000,
  100_000_000,
  65_000_000,
  50_000_000,
  21_000_000,
  10_000_000,
  1_000_000
];

/**
 * Infers initial max supply when a token has burned a portion of a canonical supply cap
 */
export function inferInitialSupplyFromCurrent(currentSupply, fdv = 0, priceUsd = 0) {
  if (!currentSupply || currentSupply <= 0) return 0;

  // Check if FDV / Price implies a known initial cap
  if (fdv > 0 && priceUsd > 0) {
    const impliedMax = fdv / priceUsd;
    for (const cap of CANONICAL_CAPS) {
      if (Math.abs(impliedMax - cap) / cap < 0.03 && currentSupply <= cap) {
        return cap;
      }
    }
  }

  // Otherwise check if currentSupply is between 68% and 99.999% of a canonical cap
  const sortedAsc = [...CANONICAL_CAPS].sort((a, b) => a - b);
  for (const cap of sortedAsc) {
    if (currentSupply <= cap && currentSupply >= cap * 0.68) {
      return cap;
    }
  }

  return Math.ceil(currentSupply);
}

/**
 * Queries live Solana Mainnet-Beta JSON-RPC for an SPL Mint's current supply
 */
export async function querySolanaMintSupply(mintAddress) {
  if (!mintAddress || mintAddress.length < 30 || mintAddress.startsWith('0x')) return null;
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `disc_${mintAddress.slice(0, 8)}`,
        method: 'getTokenSupply',
        params: [mintAddress]
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const val = json?.result?.value;
    if (!val || val.uiAmountString === undefined) return null;
    return {
      currentSupply: parseFloat(val.uiAmountString),
      decimals: Number(val.decimals ?? 6)
    };
  } catch {
    return null;
  }
}

/**
 * Queries live Sui Mainnet JSON-RPC for a Move CoinType's current total supply & decimals
 */
export async function querySuiCoinSupply(coinType) {
  if (!coinType || !coinType.includes('::')) return null;
  try {
    const [supplyRes, metaRes] = await Promise.all([
      fetch(SUI_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_getTotalSupply',
          params: [coinType]
        }),
        signal: AbortSignal.timeout(5000)
      }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(SUI_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'suix_getCoinMetadata',
          params: [coinType]
        }),
        signal: AbortSignal.timeout(5000)
      }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    ]);

    const rawVal = supplyRes?.result?.value;
    if (!rawVal) return null;
    const decimals = Number(metaRes?.result?.decimals ?? 9);
    const currentSupply = Number(BigInt(rawVal)) / Math.pow(10, decimals);
    return {
      currentSupply,
      decimals,
      name: metaRes?.result?.name || null,
      symbol: metaRes?.result?.symbol || null
    };
  } catch {
    return null;
  }
}

/**
 * Queries DexScreener for live market cap, FDV, price, and liquidity verification
 */
async function queryDexScreenerToken(address, expectedChain = '') {
  if (!address) return null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    if (pairs.length === 0) return null;

    const chainFilter = expectedChain.toLowerCase();
    const matchingPairs = chainFilter
      ? pairs.filter(p => (p.chainId || '').toLowerCase().includes(chainFilter))
      : pairs;
    const bestPair = (matchingPairs.length > 0 ? matchingPairs : pairs).sort(
      (a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0)
    )[0];

    if (!bestPair) return null;
    return {
      symbol: bestPair.baseToken?.symbol || null,
      name: bestPair.baseToken?.name || null,
      priceUsd: Number(bestPair.priceUsd) || 0,
      mcap: Number(bestPair.marketCap || bestPair.fdv) || 0,
      fdv: Number(bestPair.fdv) || 0,
      liquidityUsd: Number(bestPair.liquidity?.usd) || 0,
      chainId: bestPair.chainId || expectedChain
    };
  } catch {
    return null;
  }
}

/**
 * Auto-discovers token metadata, live on-chain supply/burn, and buyback status for unknown protocols
 * across Solana and Sui without touching already-verified core protocols.
 */
export async function autoDiscoverProtocolTokens(candidateSlugs = [], targetChain = 'solana', knownSlugsSet = new Set()) {
  let cache = { updatedAt: 0, protocols: {} };
  try {
    const raw = await fs.readFile(DISCOVERED_CACHE_FILE, 'utf-8');
    cache = JSON.parse(raw);
    if (!cache.protocols) cache.protocols = {};
  } catch {
    // start fresh
  }

  const now = Date.now();
  const isCacheFresh = cache.updatedAt && (now - cache.updatedAt < DISCOVERY_TTL_MS);

  // Filter only unknown slugs that are not blacklisted
  const unknownSlugs = candidateSlugs.filter(slug => {
    if (!slug) return false;
    const s = slug.toLowerCase().trim();
    if (knownSlugsSet.has(s)) return false;
    if (EXCLUDE_SLUGS.has(s)) return false;
    if (!isProtocolTokenVerified({ slug: s, name: s }, false)) return false;
    return true;
  });

  // Only inspect up to 18 uncached unknown protocols per cycle to keep discovery fast
  const toResolve = unknownSlugs.filter(s => !isCacheFresh || !(s in cache.protocols)).slice(0, 18);

  if (toResolve.length > 0) {
    console.log(`[TokenDiscovery] Auto-scanning ${toResolve.length} candidate ${targetChain.toUpperCase()} protocols for native tokens & on-chain supply...`);

    // Process in small batches of 5
    for (let i = 0; i < toResolve.length; i += 5) {
      const batch = toResolve.slice(i, i + 5);
      await Promise.all(
        batch.map(async slug => {
          try {
            // 1. Query DefiLlama Fee Summary for official symbol, address, and gecko_id
            const [feeSummary, holdersSummary] = await Promise.all([
              fetch(`https://api.llama.fi/summary/fees/${slug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, {
                signal: AbortSignal.timeout(5000)
              }).then(r => (r.ok ? r.json() : null)).catch(() => null),
              fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyHoldersRevenue&excludeTotalDataChartBreakdown=true`, {
                signal: AbortSignal.timeout(5000)
              }).then(r => (r.ok ? r.json() : null)).catch(() => null)
            ]);

            if (!feeSummary) {
              cache.protocols[slug] = { hasToken: false, checkedAt: now };
              return;
            }

            let rawSym = (feeSummary.symbol || '').toUpperCase().trim();
            let rawAddr = (feeSummary.address || '').trim();
            const geckoId = feeSummary.gecko_id || null;

            // Clean chain prefix from address (e.g., "solana:Mint..." or "sui:0x...::mod::COIN")
            let addressChain = targetChain;
            let cleanAddress = rawAddr;
            if (rawAddr.includes(':')) {
              const firstColon = rawAddr.indexOf(':');
              const maybeChain = rawAddr.slice(0, firstColon).toLowerCase();
              if (!maybeChain.startsWith('0x')) {
                addressChain = maybeChain;
                cleanAddress = rawAddr.slice(firstColon + 1);
              }
            }

            // Verify with strict token filter
            if (
              (!rawSym || rawSym === '-' || rawSym === 'NULL') &&
              !cleanAddress &&
              !geckoId
            ) {
              cache.protocols[slug] = { hasToken: false, checkedAt: now };
              return;
            }

            // 2. Enrich with DexScreener market cap, price & liquidity if address is available
            const dexInfo = cleanAddress ? await queryDexScreenerToken(cleanAddress, targetChain) : null;
            if (!rawSym && dexInfo?.symbol) {
              rawSym = dexInfo.symbol.toUpperCase().trim();
            }

            if (!isProtocolTokenVerified({ slug, name: feeSummary.name || slug, symbol: rawSym }, true)) {
              cache.protocols[slug] = { hasToken: false, checkedAt: now };
              return;
            }

            // Anti-Fake Shield: require either official DefiLlama address/gecko_id OR verified liquidity >= $15k
            if (!cleanAddress && !geckoId && (!dexInfo || dexInfo.liquidityUsd < 15000)) {
              cache.protocols[slug] = { hasToken: false, checkedAt: now };
              return;
            }

            // 3. Query Live On-Chain Supply & Burn (Solana RPC or Sui RPC)
            let currentSupply = 0;
            let initialSupply = 0;
            let burnedTokens = 0;
            let burnedPctOfMax = 0;
            let decimals = targetChain === 'sui' ? 9 : 6;

            if (targetChain === 'solana' && cleanAddress && !cleanAddress.startsWith('0x')) {
              const solSupply = await querySolanaMintSupply(cleanAddress);
              if (solSupply && solSupply.currentSupply > 0) {
                currentSupply = solSupply.currentSupply;
                decimals = solSupply.decimals;
                initialSupply = inferInitialSupplyFromCurrent(currentSupply, dexInfo?.fdv, dexInfo?.priceUsd);
                burnedTokens = Math.max(0, Math.round(initialSupply - currentSupply));
                burnedPctOfMax = initialSupply > 0 ? Math.round((burnedTokens / initialSupply) * 10000) / 100 : 0;
              }
            } else if (targetChain === 'sui' && cleanAddress && cleanAddress.startsWith('0x')) {
              const suiSupply = await querySuiCoinSupply(cleanAddress);
              if (suiSupply && suiSupply.currentSupply > 0) {
                currentSupply = suiSupply.currentSupply;
                decimals = suiSupply.decimals;
                initialSupply = inferInitialSupplyFromCurrent(currentSupply, dexInfo?.fdv, dexInfo?.priceUsd);
                burnedTokens = Math.max(0, Math.round(initialSupply - currentSupply));
                burnedPctOfMax = initialSupply > 0 ? Math.round((burnedTokens / initialSupply) * 10000) / 100 : 0;
              }
            }

            // 4. Check On-Chain Holders Revenue / Buybacks from DefiLlama
            const holdersChart = Array.isArray(holdersSummary?.totalDataChart) ? holdersSummary.totalDataChart : [];
            const cumulativeHoldersRevUsd = Math.round(
              holdersChart.reduce((sum, [, val]) => sum + (Number(val) || 0), 0)
            );
            const hasBuyback = cumulativeHoldersRevUsd > 0 || Boolean(holdersSummary?.total24h > 0 || holdersSummary?.total7d > 0);
            const hasBurn = burnedTokens > 1000;

            cache.protocols[slug] = {
              hasToken: true,
              slug,
              name: feeSummary.name || dexInfo?.name || slug,
              symbol: rawSym,
              chain: targetChain,
              addressChain,
              contractAddress: cleanAddress || null,
              geckoId,
              mcap: Number(feeSummary.mcap || dexInfo?.mcap || dexInfo?.fdv || 0),
              priceUsd: Number(dexInfo?.priceUsd || 0),
              liquidityUsd: Number(dexInfo?.liquidityUsd || 0),
              decimals,
              initialSupply,
              currentSupply: Math.round(currentSupply),
              burnedTokens,
              burnedPctOfMax,
              hasBuyback,
              hasBurn,
              cumulativeHoldersRevUsd,
              checkedAt: now
            };
          } catch {
            cache.protocols[slug] = { hasToken: false, checkedAt: now };
          }
        })
      );
    }

    cache.updatedAt = now;
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(DISCOVERED_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // ignore write warning
    }
  }

  // Return map of verified discovered tokenized protocols for targetChain
  const result = new Map();
  for (const [slug, info] of Object.entries(cache.protocols)) {
    if (info && info.hasToken && info.symbol && (!info.chain || info.chain === targetChain)) {
      result.set(slug, info);
    }
  }
  return result;
}
