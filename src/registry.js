import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtocolTokenVerified } from './tokenFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const REGISTRY_FILE = path.join(CACHE_DIR, 'protocol_registry.json');

// Comprehensive block explorer URL mapper
export function getExplorerUrl(chain, address) {
  if (!address) return null;
  const lowerChain = (chain || 'ethereum').toLowerCase().trim();

  if (lowerChain === 'solana') {
    return `https://solscan.io/account/${address}`;
  }
  if (lowerChain === 'base') {
    return `https://basescan.org/address/${address}`;
  }
  if (lowerChain === 'arbitrum') {
    return `https://arbiscan.io/address/${address}`;
  }
  if (lowerChain === 'bsc' || lowerChain === 'binance') {
    return `https://bscscan.com/address/${address}`;
  }
  if (lowerChain === 'polygon') {
    return `https://polygonscan.com/address/${address}`;
  }
  if (lowerChain === 'optimism' || lowerChain === 'op mainnet') {
    return `https://optimistic.etherscan.io/address/${address}`;
  }
  if (lowerChain === 'avalanche') {
    return `https://snowtrace.io/address/${address}`;
  }
  if (lowerChain.includes('hyperliquid')) {
    return `https://hypurrscan.io/address/${address}`;
  }
  if (lowerChain === 'sui') {
    return `https://suiscan.xyz/mainnet/account/${address}`;
  }
  if (lowerChain === 'fantom') {
    return `https://ftmscan.com/address/${address}`;
  }
  if (lowerChain === 'sonic') {
    return `https://sonicscan.org/address/${address}`;
  }
  if (lowerChain === 'linea') {
    return `https://lineascan.build/address/${address}`;
  }
  if (lowerChain === 'blast') {
    return `https://blastscan.io/address/${address}`;
  }
  if (lowerChain.includes('zksync')) {
    return `https://explorer.zksync.io/address/${address}`;
  }
  if (lowerChain === 'scroll') {
    return `https://scrollscan.com/address/${address}`;
  }
  if (lowerChain === 'mantle') {
    return `https://mantlescan.xyz/address/${address}`;
  }
  if (lowerChain === 'cronos') {
    return `https://cronoscan.com/address/${address}`;
  }
  if (lowerChain === 'tron') {
    return `https://tronscan.org/#/address/${address}`;
  }
  if (lowerChain === 'aptos') {
    return `https://explorer.aptoslabs.com/account/${address}`;
  }
  if (lowerChain === 'metis') {
    return `https://andromeda-explorer.metis.io/address/${address}`;
  }
  if (lowerChain === 'celo') {
    return `https://celoscan.io/address/${address}`;
  }

  // Default to Ethereum Etherscan
  return `https://etherscan.io/address/${address}`;
}

export function getExplorerName(chain) {
  const lowerChain = (chain || 'ethereum').toLowerCase().trim();
  if (lowerChain === 'solana') return 'Solscan';
  if (lowerChain === 'base') return 'Basescan';
  if (lowerChain === 'arbitrum') return 'Arbiscan';
  if (lowerChain === 'bsc' || lowerChain === 'binance') return 'BscScan';
  if (lowerChain === 'polygon') return 'Polygonscan';
  if (lowerChain === 'optimism' || lowerChain === 'op mainnet') return 'Optimism Etherscan';
  if (lowerChain === 'avalanche') return 'Snowtrace';
  if (lowerChain.includes('hyperliquid')) return 'Hypurrscan';
  if (lowerChain === 'sui') return 'Suiscan';
  if (lowerChain === 'sonic') return 'Sonicscan';
  if (lowerChain === 'fantom') return 'FtmScan';
  if (lowerChain === 'linea') return 'Lineascan';
  if (lowerChain === 'blast') return 'Blastscan';
  if (lowerChain.includes('zksync')) return 'zkSync Explorer';
  if (lowerChain === 'scroll') return 'Scrollscan';
  return 'Etherscan';
}

export async function buildProtocolRegistry() {
  console.log('[Registry] Building master protocol registry with STRICT verified native token enforcement...');

  try {
    const res = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Failed to fetch protocols: ${res.statusText}`);
    const data = await res.json();

    const registry = [];
    const registryMap = new Map();

    for (const p of data) {
      // 1. Strict verification: must have its OWN verified native token
      if (!isProtocolTokenVerified(p)) {
        continue;
      }

      const symbol = p.symbol ? p.symbol.trim() : '';
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

      const primaryChain = p.chain && p.chain !== 'Multi-Chain' ? p.chain : (p.chains && p.chains[0] ? p.chains[0] : 'Multi-Chain');
      const explorerUrl = cleanAddress ? getExplorerUrl(addressChain, cleanAddress) : null;

      const item = {
        id: String(p.id),
        name: p.name,
        slug: p.slug,
        tokenSymbol: symbol.toUpperCase(),
        category: p.category || 'Other',
        primaryChain: primaryChain,
        chains: Array.isArray(p.chains) && p.chains.length > 0 ? p.chains : [primaryChain],
        contractAddress: cleanAddress,
        addressChain: addressChain,
        explorerUrl: explorerUrl,
        explorerName: cleanAddress ? getExplorerName(addressChain) : null,
        mcap: p.mcap || 0,
        tvl: p.tvl || 0,
        logo: p.logo || null,
        geckoId: p.gecko_id || null,
        parentProtocol: p.parentProtocol || null
      };

      registry.push(item);

      if (item.id) registryMap.set(item.id, item);
      if (item.slug) registryMap.set(item.slug.toLowerCase(), item);
      if (item.name) registryMap.set(item.name.toLowerCase(), item);
    }

    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
    } catch {
      // Ignore read-only filesystem warning in serverless environments
    }
    console.log(`[Registry] Master registry created: ${registry.length} protocols with verified native tokens & contracts!`);

    return { registry, registryMap };
  } catch (err) {
    console.error('[Registry] Error building protocol registry:', err);
    throw err;
  }
}

// Load cached registry or build if missing
export async function getProtocolRegistry(force = false) {
  if (!force) {
    try {
      const raw = await fs.readFile(REGISTRY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Enforce verification filter even on cached data
        return parsed.filter(isProtocolTokenVerified);
      }
    } catch {
      // file not found or corrupted, rebuild
    }
  }
  const { registry } = await buildProtocolRegistry();
  return registry;
}

// Compute chain-level statistics
export function getChainsDirectory(protocols) {
  const chainMap = {};

  for (const p of protocols) {
    if (!isProtocolTokenVerified(p)) continue;

    for (const c of p.chains) {
      if (!c) continue;
      if (!chainMap[c]) {
        chainMap[c] = {
          chain: c,
          totalProtocols: 0,
          verifiedContracts: 0,
          categories: {},
          explorerName: getExplorerName(c),
          sampleProtocols: []
        };
      }
      chainMap[c].totalProtocols++;
      if (p.contractAddress) {
        chainMap[c].verifiedContracts++;
      }
      chainMap[c].categories[p.category] = (chainMap[c].categories[p.category] || 0) + 1;
      if (chainMap[c].sampleProtocols.length < 5) {
        chainMap[c].sampleProtocols.push({
          name: p.name,
          symbol: p.tokenSymbol,
          contractAddress: p.contractAddress,
          category: p.category
        });
      }
    }
  }

  return Object.values(chainMap).sort((a, b) => b.totalProtocols - a.totalProtocols);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildProtocolRegistry().then(({ registry }) => {
    console.log(`Registry rebuilt: ${registry.length} protocols with verified native tokens.`);
    const chains = getChainsDirectory(registry);
    console.log(`Chains tracked: ${chains.length}. Top 5:`, chains.slice(0, 5));
  }).catch(console.error);
}
