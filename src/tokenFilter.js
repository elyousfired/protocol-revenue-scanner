// Master Token Verification Filter
// Strictly enforces that only protocols with their OWN VERIFIED NATIVE PROTOCOL TOKEN are included.

export const EXCLUDE_SLUGS = new Set([
  // Tokenless protocols
  'pump.fun', 'pumpswap', 'pump.fun-mobile-app', 'terminal',
  'polymarket', 'polymarket-international',
  'gmgn', 'gmgn-ai',
  'axiom', 'axiome-swap',
  'base', 'base-bridge', 'coinbase-bridge',
  'opensea', 'metamask', 'phantom', 'rainbow',
  'farcaster', 'debank', 'zapper', 'fomo3d',
  
  // Centralized Exchanges & Off-Chain Companies
  'binance-cex', 'binance-alpha', 'okx', 'gate', 'gate-us', 'mexc',
  'bitkub', 'swissborg', 'bitmex', 'backpack', 'nexo', 'weex', 'phemex',
  'bitkan', 'coinex', 'kraken', 'coinbase', 'bybit', 'bitget',
  'tether', 'tether-gold', 'circle', 'circle-bitcoin', 'paxos-stablecoin-issuer',
  
  // Base Layer 1 / Layer 2 Chains (not DeFi protocols)
  'bitcoin', 'solana', 'ethereum-foundation', 'tron', 'canton',
  'arbitrum-nitro', 'layer3',
  
  // dApps that borrow another protocol's token
  'launchlab', 'bonk.fun-launchpad', 'near-intents'
]);

export const EXCLUDE_CATEGORIES = new Set([
  'cex', 'foundation', 'chain', 'custody'
]);

export const BASE_GAS_AND_FIAT_STABLES = new Set([
  'ETH', 'BTC', 'SOL', 'USDT', 'USDC', 'DAI', 'WETH', 'WBTC', 'BNB', 'TRX', 
  'NEAR', 'AVAX', 'MATIC', 'POL', 'DOT', 'ADA', 'XRP', 'FIL', 'APT', 'S', 
  'TIA', 'FLOW', 'HBAR', 'CELO', 'FTM'
]);

export function isProtocolTokenVerified(p, requireSymbol = true) {
  if (!p) return false;
  const slug = (p.slug || '').toLowerCase().trim();
  const name = (p.name || '').toLowerCase().trim();
  const cat = (p.category || '').toLowerCase().trim();
  const sym = (p.tokenSymbol || p.symbol || '').toUpperCase().trim();

  // 1. Blacklisted slugs
  if (EXCLUDE_SLUGS.has(slug)) return false;

  // 2. Blacklisted categories (CEXs, Chains, Foundations)
  if (EXCLUDE_CATEGORIES.has(cat)) return false;

  // 3. String matches for known tokenless apps
  if (slug.includes('pump.fun') || slug.includes('pumpswap') || name.includes('pump.fun')) return false;
  if (slug.includes('polymarket') || name.includes('polymarket')) return false;
  if (slug.includes('gmgn') || name.includes('gmgn')) return false;
  if (slug.includes('axiom') || name.includes('axiom')) return false;
  if (slug.includes('opensea') || name.includes('opensea')) return false;
  if (slug.includes('tether') || slug.includes('circle')) return false;
  if (slug.includes('metamask') || slug.includes('phantom') || slug.includes('rainbow')) return false;

  if (requireSymbol) {
    // 4. Base chain / gas tokens borrowed by dApps (e.g. SOL, BTC, ETH) unless native CDP like Maker/Sky/Ethena
    if (BASE_GAS_AND_FIAT_STABLES.has(sym)) {
      const isLegitNativeIssuer = slug.includes('maker') || slug.includes('sky') || slug.includes('ethena');
      if (!isLegitNativeIssuer) return false;
    }

    // 5. Symbol sanity checks
    if (!sym || sym === '-' || sym === 'NULL' || sym === 'NONE' || sym === 'N/A' || sym === 'UNKNOWN') return false;
    if (sym.length > 12) return false;
  }

  return true;
}
