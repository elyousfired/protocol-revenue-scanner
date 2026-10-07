import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSuiEcosystem } from './suiWatcher.js';
import { getSolanaEcosystem } from './solanaWatcher.js';
import { getEthereumEcosystem } from './ethereumWatcher.js';
import { getMonadEcosystem } from './monadWatcher.js';
import { getBaseEcosystem } from './baseWatcher.js';
import { getHyperliquidEcosystem } from './hyperliquidWatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const BYBIT_CACHE_FILE = path.join(CACHE_DIR, 'bybit_spot.json');
const TMP_BYBIT_CACHE_FILE = path.join('/tmp', 'bybit_spot.json');
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes live market TTL

let memoryBybitCache = null;

// Stablecoins and leveraged tokens to exclude from spot token rankings
const EXCLUDED_BASE_SYMBOLS = new Set([
  'USDC', 'FDUSD', 'USDE', 'DAI', 'TUSD', 'USDD', 'PYUSD', 'USDP', 'USD1', 'USDY', 'USDTB',
  'RLUSD', 'USTC', 'USAT', 'USDS', 'USD0', 'FRAX', 'LUSD', 'GHO', 'DEUSD',
  'EUR', 'EURC', 'EURT', 'BRZ', 'TRY', 'BRL'
]);

export const BYBIT_CATEGORIES = {
  l1: {
    id: 'l1',
    name: 'Layer 1 Chains',
    arabicLabel: 'شبكات الطبقة الأولى',
    icon: '⛓️',
    color: 'cyan',
    description: 'Base layer blockchains & native gas tokens traded on Bybit Spot'
  },
  memes: {
    id: 'memes',
    name: 'Memes & Culture',
    arabicLabel: 'عملات الميمز',
    icon: '🐸',
    color: 'amber',
    description: 'High-velocity community meme tokens & viral cultural assets'
  },
  ai: {
    id: 'ai',
    name: 'AI & Autonomous Agents',
    arabicLabel: 'الذكاء الاصطناعي',
    icon: '🤖',
    color: 'purple',
    description: 'Artificial intelligence networks, LLM agents & decentralized machine learning'
  },
  defi: {
    id: 'defi',
    name: 'DeFi, DEX & Yield',
    arabicLabel: 'التمويل اللامركزي',
    icon: '🏦',
    color: 'emerald',
    description: 'Decentralized exchanges, lending markets, liquid staking & perp protocols'
  },
  launchpad: {
    id: 'launchpad',
    name: 'Launchpads & Exchange',
    arabicLabel: 'منصات الإطلاق والتداول',
    icon: '🚀',
    color: 'pink',
    description: 'Token launchpads, IDO ecosystems & exchange utility tokens'
  },
  rwa: {
    id: 'rwa',
    name: 'RWA & PayFi',
    arabicLabel: 'الأصول الواقعية والمدفوعات',
    icon: '🏛️',
    color: 'teal',
    description: 'Tokenized real-world assets, equities, treasuries, credit & global payments'
  },
  depin: {
    id: 'depin',
    name: 'DePIN & Compute',
    arabicLabel: 'البنية التحتية الفيزيائية',
    icon: '📡',
    color: 'indigo',
    description: 'Decentralized physical infrastructure, GPU rendering, storage & wireless nodes'
  },
  l2: {
    id: 'l2',
    name: 'Layer 2 & Zero-Knowledge',
    arabicLabel: 'شبكات الطبقة الثانية',
    icon: '⚡',
    color: 'blue',
    description: 'Rollups, modular scaling layers & zero-knowledge proof networks'
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming, NFT & Metaverse',
    arabicLabel: 'الألعاب والميتافيرس',
    icon: '🎮',
    color: 'rose',
    description: 'Web3 gaming studios, NFT marketplaces, fan tokens & metaverse worlds'
  },
  infra: {
    id: 'infra',
    name: 'Oracles, Bridges & Infra',
    arabicLabel: 'الأوراكل والبنية التحتية',
    icon: '🔮',
    color: 'slate',
    description: 'Cross-chain bridges, oracle feeds, identity, security & middleware'
  }
};

// Curated token-to-category mapping for Bybit Spot assets
const TOKEN_CATEGORY_MAP = {
  // Layer 1
  BTC: 'l1', ETH: 'l1', SOL: 'l1', SUI: 'l1', HYPE: 'l1', XRP: 'rwa', ADAVAX: 'l1',
  TON: 'l1', DOT: 'l1', TRX: 'l1', APT: 'l1', SEI: 'l1', INJ: 'l1', TIA: 'l1',
  ATOM: 'l1', KAALGO: 'rwa', FTM: 'l1', SONIC: 'l1', BERA: 'l1',
  MON: 'l1', KAVEGLD: 'l1', MINFLOW: 'l1', XTZ: 'l1', EOS: 'l1',
  IOTNEO: 'l1', VET: 'l1', ZIL: 'l1', ONE: 'l1', CELO: 'l1',
  ROSE: 'l1', KSM: 'l1', ASTR: 'l1', GLMR: 'l1', CFX: 'l1', CKB: 'l1', CORE: 'l1',
  ZETMOVE: 'l2', INIT: 'l1', IP: 'l1', LTC: 'l1', BCH: 'l1',
  ETC: 'l1', DOGE: 'memes', XLM: 'rwa', HBAR: 'rwa', FLR: 'l1', SGB: 'l1', XDC: 'rwa',
  QTUM: 'l1', ICX: 'l1', ONT: 'l1', WAVERVN: 'l1', XEC: 'l1', CSPR: 'l1',
  XCH: 'l1', KLAY: 'l1', KAIVTHO: 'l1', GALUNLUNC: 'l1',
  XPL: 'l1', GRAM: 'memes', PARTI: 'l1', DYM: 'l1', SUPRMOVR: 'l1',
  WEMIX: 'l1', KUB: 'l1', ETHW: 'l1', DIAM: 'l1', KII: 'l1', LAYER: 'l2', STABLE: 'l1',
  NTRN: 'l1', XEM: 'l1',

  // Memes
  PEPE: 'memes', SHIB: 'memes', BONK: 'memes', WIF: 'memes', FLOKI: 'memes',
  POPCAT: 'memes', MOG: 'memes', BRETT: 'memes', MEW: 'memes', NEIRO: 'memes',
  NEIROCTO: 'memes', TURBO: 'memes', PNUT: 'memes', GOAT: 'memes', FARTCOIN: 'memes',
  ACT: 'memes', MOODENG: 'memes', CHILLGUY: 'memes', PENGU: 'memes', SPX: 'memes',
  GIGA: 'memes', BOME: 'memes', SLERF: 'memes', MYRO: 'memes', WEN: 'memes',
  PONKE: 'memes', TOSHI: 'memes', DOG: 'memes', BABYDOGE: 'memes', MEME: 'memes',
  PEOPLE: 'memes', SUNDOG: 'memes', CATI: 'gaming', DOGS: 'memes', HMSTR: 'gaming',
  NOT: 'gaming', TRUMP: 'memes', MELANIA: 'memes', VINE: 'memes', JELLYJELLY: 'memes',
  TST: 'memes', BROCCOLI: 'memes', CHEEMS: 'memes', KOMA: 'memes', DEGEN: 'memes',
  COQ: 'memes', AIDOGE: 'memes', LADYS: 'memes', ELON: 'memes', SNEK: 'memes',
  FOXY: 'memes', MANEKI: 'memes', MICHI: 'memes', BILLY: 'memes', MOTHER: 'memes',
  DADDY: 'memes', FWOG: 'memes', RETARDIO: 'memes', HIPPO: 'memes',
  BAN: 'memes', LUCE: 'memes', RIF: 'memes', URO: 'memes', MAJOR: 'memes',
  MEMEFI: 'memes', X: 'memes', PONK: 'memes', PUFF: 'memes',
  ORDI: 'memes', SATS: 'memes', RATS: 'memes', BILL: 'memes', BASED: 'memes',
  DOOD: 'memes', BIRB: 'memes', PYBOBO: 'memes', FIGHT: 'memes', FOGO: 'memes',
  PURR: 'memes', HFUN: 'memes', JEFF: 'memes', POINTS: 'memes',

  // AI & Agents
  TAO: 'ai', FET: 'ai', NEAR: 'ai', ICP: 'ai', VIRTUAL: 'ai', AI16Z: 'ai',
  AIXBT: 'ai', ZEREBRO: 'ai', GRIFFAIN: 'ai', ARC: 'ai', SWARMS: 'ai', COOKIE: 'ai',
  CGPT: 'ai', PHB: 'ai', AGIX: 'ai', OCEAN: 'ai', ARKM: 'ai', WLD: 'ai', KAITO: 'ai',
  GRASS: 'ai', IO: 'ai', ATAKT: 'ai', AIOZ: 'ai', GLM: 'ai',
  NMR: 'ai', TRAC: 'ai', VANA: 'ai', SAHARA: 'ai', PAAL: 'ai', PRIME: 'ai',
  NFP: 'ai', AI: 'ai', SHELL: 'ai', REI: 'ai', NOS: 'ai', FLUX: 'ai',
  SPEC: 'ai', GTAI: 'ai', RSS3: 'ai', ORAI: 'ai', RLC: 'ai', CTXC: 'ai',
  IQ: 'ai', ALI: 'ai', AITECPROMPT: 'ai', NIL: 'ai', SIGN: 'ai',
  VVV: 'ai', ALCH: 'ai', '0G': 'ai', FHE: 'ai', RECALL: 'ai', ROBO: 'ai',
  SXT: 'ai', SENT: 'ai', ELSA: 'ai', CARV: 'ai', LMWR: 'ai', TA: 'ai',
  OPG: 'ai', NEWT: 'ai', H: 'ai',

  // DePIN & Compute
  RENDER: 'depin', RNDR: 'depin', FIL: 'depin', AR: 'depin', HNT: 'depin',
  IOTX: 'depin', THETA: 'depin', TFUEL: 'depin', JASMY: 'depin', STORJ: 'depin',
  SC: 'depin', BTT: 'depin', LPT: 'depin', POKT: 'depin', DIMO: 'depin',
  HONEY: 'depin', GEOD: 'depin', MOBILE: 'depin', PEAQ: 'depin', NATIX: 'depin',
  PHA: 'depin', NYM: 'depin', HOPR: 'depin', DATA: 'depin', OXT: 'depin',
  ANKR: 'depin', DENT: 'depin', HOT: 'depin', NODE: 'depin', WAL: 'depin',
  ROAM: 'depin', ICNT: 'depin',

  // Launchpads & Exchange Tokens
  PUMP: 'launchpad', JUP: 'launchpad', RAY: 'launchpad', CAKE: 'launchpad',
  BNB: 'launchpad', MNT: 'launchpad', BGB: 'launchpad', OKB: 'launchpad',
  CRO: 'launchpad', GT: 'launchpad', KCS: 'launchpad', MX: 'launchpad',
  WOO: 'launchpad', AUCTION: 'launchpad', BAKE: 'launchpad', POLS: 'launchpad',
  DAO: 'launchpad', SFUND: 'launchpad', TKO: 'launchpad', HOOK: 'launchpad',
  EDU: 'launchpad', PORTAL: 'launchpad', ALT: 'launchpad', MANTA: 'launchpad',
  SAGA: 'launchpad', OMNI: 'launchpad', REZ: 'launchpad', BB: 'launchpad',
  LISTA: 'launchpad', BANANA: 'launchpad', MET: 'launchpad', BMT: 'launchpad',
  BIO: 'launchpad', PONS: 'launchpad', FTT: 'launchpad', HTX: 'launchpad',

  // DeFi, DEX & Yield
  UNI: 'defi', AAVE: 'defi', MKR: 'defi', SKY: 'defi', LDO: 'defi',
  PENDLE: 'defi', ENA: 'defi', CRV: 'defi', CVX: 'defi', COMP: 'defi',
  SNX: 'defi', '1INCH': 'defi', SUSHI: 'defi', DYDX: 'defi', GMX: 'defi',
  GNS: 'defi', JTO: 'defi', KMNO: 'defi', DRIFT: 'defi', ORCA: 'defi',
  CETUS: 'defi', DEEP: 'defi', NAVX: 'defi', SCA: 'defi', TURBOS: 'defi',
  MORPHO: 'defi', EIGEN: 'defi', ETHFI: 'defi', PUFFER: 'defi', SWELL: 'defi',
  RPL: 'defi', FXS: 'defi', BAL: 'defi', YFI: 'defi', ZRX: 'defi',
  UMA: 'defi', LQTY: 'defi', SPELL: 'defi', JOE: 'defi', AERO: 'defi',
  THE: 'defi', COW: 'defi', KERNEL: 'defi', ORDER: 'defi', APEX: 'defi',
  HLP: 'defi', OSMO: 'defi', RUNE: 'defi', KNC: 'defi', PERP: 'defi',
  DODO: 'defi', MAV: 'defi', HFT: 'defi', QUICK: 'defi', RDNT: 'defi',
  VENUS: 'defi', XVS: 'defi', ALPACA: 'defi', BEL: 'defi', ALPHA: 'defi',
  STG: 'defi', SYN: 'defi', ACX: 'defi', FLUID: 'defi', EUL: 'defi',
  SPK: 'defi', WLFI: 'defi', BARD: 'defi', FF: 'defi', VELO: 'defi',
  HAEDAL: 'defi', MMT: 'defi', ASTER: 'defi', STETH: 'defi', BBSOL: 'defi',
  METH: 'defi', WBTC: 'defi', RESOLV: 'defi', BLEND: 'defi', AEVO: 'defi',
  VOOI: 'defi', GRVT: 'defi', SOLV: 'defi', ENSO: 'defi', ZIG: 'defi',
  ARX: 'defi', TRIA: 'defi', SLX: 'defi', HOME: 'defi', TREE: 'defi',

  // RWA & PayFi
  ONDO: 'rwa', OM: 'rwa', USUAL: 'rwa', SYRUP: 'rwa', MPL: 'rwa', CFG: 'rwa',
  TRU: 'rwa', POLYX: 'rwa', PRO: 'rwa', GFI: 'rwa', CPOOL: 'rwa',
  CTC: 'rwa', QNT: 'rwa', ACH: 'rwa', AMP: 'rwa', PLUME: 'rwa',
  PRCL: 'rwa', RSR: 'rwa', CHR: 'rwa', LTO: 'rwa', DUSK: 'rwa',
  HIFI: 'rwa', TOKEN: 'rwa', PAXG: 'rwa', XAUT: 'rwa', HUMA: 'rwa',
  MANTRA: 'rwa', TEL: 'rwa', AVA: 'rwa', NEXO: 'rwa',
  CRCLX: 'rwa', SPCXX: 'rwa', COINX: 'rwa', NVDAX: 'rwa', AMZNX: 'rwa',
  HOODX: 'rwa', TSLAX: 'rwa', GOOGLX: 'rwa', AAPLX: 'rwa', MCDX: 'rwa',

  // Layer 2 & Zero-Knowledge
  ARB: 'l2', OP: 'l2', POL: 'l2', MATIC: 'l2', STRK: 'l2',
  ZK: 'l2', IMX: 'l2', METIS: 'l2', BLAST: 'l2', MODE: 'l2',
  SCROLL: 'l2', SCR: 'l2', TAIKO: 'l2', LINEA: 'l2', ZRC: 'l2',
  BOBA: 'l2', LRC: 'l2', SKL: 'l2', CTSI: 'l2', CYBER: 'l2',
  MERL: 'l2', STX: 'l2', B2: 'l2', AZTEC: 'l2', SOON: 'l2',
  ZKF: 'l2', AURORA: 'l2', CORN: 'l2', ERA: 'l2',
  ZEN: 'l1',

  // Gaming, NFT & Metaverse
  GALA: 'gaming', SAND: 'gaming', MANA: 'gaming', AXS: 'gaming', APE: 'gaming',
  BLUR: 'gaming', ME: 'gaming', TNSR: 'gaming', BEAM: 'gaming', RON: 'gaming',
  ILV: 'gaming', SUPER: 'gaming', YGG: 'gaming', PIXEL: 'gaming', XAI: 'gaming',
  BIGTIME: 'gaming', GMT: 'gaming', ALICE: 'gaming', TLM: 'gaming', ENJ: 'gaming',
  CHZ: 'gaming', WAXP: 'gaming', GODS: 'gaming', MAGIC: 'gaming', HIGH: 'gaming',
  VOXEL: 'gaming', DAR: 'gaming', LOKA: 'gaming', COMBO: 'gaming', ACE: 'gaming',
  MAVIA: 'gaming', PIRATE: 'gaming', ZENT: 'gaming', ANIME: 'gaming', SLP: 'gaming',
  MBOX: 'gaming', PYR: 'gaming', GHST: 'gaming', RACA: 'gaming', AGLD: 'gaming',
  XTER: 'gaming', B3: 'gaming', MOCA: 'gaming', PIEVERSE: 'gaming', NXPC: 'gaming',
  A8: 'gaming', MBX: 'gaming', MCRT: 'gaming', MEE: 'gaming', PSG: 'gaming',
  JUV: 'gaming', CITY: 'gaming', ESE: 'gaming',

  // Oracles, Bridges & Infra
  LINK: 'infra', PYTH: 'infra', API3: 'infra', BAND: 'infra', TRB: 'infra',
  GRT: 'infra', ENS: 'infra', ID: 'infra', W: 'infra', AXL: 'infra',
  ZRO: 'infra', SAFE: 'infra', BICO: 'infra', SSV: 'infra', OBOL: 'infra',
  ZEC: 'infra', XMR: 'infra', DASH: 'infra', SCRT: 'infra', MASK: 'infra',
  ARK: 'infra', RAD: 'infra', GTC: 'infra', C98: 'infra', TWT: 'infra',
  SFP: 'infra', BAT: 'infra', CVC: 'infra', CELR: 'infra', DBR: 'infra',
  RED: 'infra', LAVA: 'infra', SQD: 'infra', WCT: 'infra', TOWNS: 'infra',
  FORT: 'infra', GPS: 'infra', NS: 'infra', FIDA: 'infra', G: 'infra',
  HYPER: 'infra'
};

// Curated native and primary blockchains for tokens traded on Bybit Spot
export const KNOWN_TOKEN_BLOCKCHAINS = {
  // Layer 1 Chains
  BTC: ['Bitcoin'],
  ETH: ['Ethereum'],
  SOL: ['Solana'],
  SUI: ['Sui'],
  MON: ['Monad'],
  XRP: ['XRP Ledger'],
  NEAR: ['NEAR Protocol'],
  HYPE: ['Hyperliquid L1', 'HyperEVM'],
  HYPER: ['Hyperliquid L1', 'HyperEVM', 'Ethereum'],
  PURR: ['Hyperliquid L1', 'HyperEVM'],
  HLP: ['Hyperliquid L1'],
  HFUN: ['Hyperliquid L1'],
  JEFF: ['Hyperliquid L1'],
  POINTS: ['Hyperliquid L1'],
  AVAX: ['Avalanche'],
  DOGE: ['Dogecoin'],
  TON: ['TON Network'],
  TRX: ['Tron'],
  ADA: ['Cardano'],
  BNB: ['BNB Chain'],
  DOT: ['Polkadot'],
  ATOM: ['Cosmos Hub'],
  INJ: ['Injective'],
  TIA: ['Celestia'],
  SEI: ['Sei Network'],
  APT: ['Aptos'],
  FTM: ['Fantom'],
  SONIC: ['Sonic'],
  HBAR: ['Hedera'],
  LTC: ['Litecoin'],
  BCH: ['Bitcoin Cash'],
  ETC: ['Ethereum Classic'],
  XLM: ['Stellar'],
  ALGO: ['Algorand'],
  KAS: ['Kaspa'],
  BERA: ['Berachain'],
  IP: ['Story Protocol'],
  KAIA: ['Kaia'],

  // Layer 2 Rollups
  ARB: ['Arbitrum'],
  OP: ['Optimism'],
  MNT: ['Mantle'],
  STRK: ['Starknet'],
  ZK: ['ZKsync'],
  POL: ['Polygon'],
  MATIC: ['Polygon'],
  BLAST: ['Blast'],
  SCROLL: ['Scroll'],
  LINEA: ['Linea'],
  TAIKO: ['Taiko'],
  METIS: ['Metis'],
  IMX: ['ImmutableX'],

  // Base Native Tokens
  AERO: ['Base'],
  VIRTUAL: ['Base'],
  BRETT: ['Base'],
  DEGEN: ['Base'],
  WELL: ['Base'],
  SEAM: ['Base'],
  EXTRA: ['Base'],
  TOSHI: ['Base'],
  CLANKER: ['Base'],
  MIGGLES: ['Base'],
  ALB: ['Base'],

  // Top Solana Ecosystem Tokens
  PUMP: ['Solana'],
  BONK: ['Solana'],
  WIF: ['Solana'],
  JUP: ['Solana'],
  RAY: ['Solana'],
  MET: ['Solana'],
  JTO: ['Solana'],
  KMNO: ['Solana'],
  DRIFT: ['Solana'],
  ORCA: ['Solana'],
  PENGU: ['Solana', 'Ethereum'],
  TRUMP: ['Solana'],
  MELANIA: ['Solana'],
  FARTCOIN: ['Solana'],
  AI16Z: ['Solana'],
  GRASS: ['Solana'],
  ACT: ['Solana'],
  PNUT: ['Solana'],
  GOAT: ['Solana'],
  MOODENG: ['Solana'],
  CHILLGUY: ['Solana'],
  GIGA: ['Solana'],
  BOME: ['Solana'],
  POPCAT: ['Solana'],
  MEW: ['Solana'],
  HNT: ['Solana'],
  MOBILE: ['Solana'],
  HONEY: ['Solana'],
  PRCL: ['Solana'],

  // Top Ethereum Ecosystem Tokens
  PEPE: ['Ethereum'],
  SHIB: ['Ethereum'],
  ENA: ['Ethereum'],
  AAVE: ['Ethereum'],
  UNI: ['Ethereum'],
  LINK: ['Ethereum'],
  MKR: ['Ethereum'],
  SKY: ['Ethereum'],
  LDO: ['Ethereum'],
  PENDLE: ['Ethereum'],
  CRV: ['Ethereum'],
  CVX: ['Ethereum'],
  MORPHO: ['Ethereum', 'Base'],
  EIGEN: ['Ethereum'],
  ETHFI: ['Ethereum'],
  RNDR: ['Ethereum'],
  QNT: ['Ethereum'],
  XAUT: ['Ethereum'],
  PAXG: ['Ethereum'],
  DATA: ['Ethereum'],
  SAND: ['Ethereum'],
  MANA: ['Ethereum'],
  GALA: ['Ethereum'],
  LIT: ['Ethereum'],
  NEIRO: ['Ethereum'],
  TURBO: ['Ethereum'],
  MOG: ['Ethereum'],
  SPX: ['Ethereum', 'Solana'],
  WLD: ['World Chain', 'Optimism'],

  // TON Network
  GRAM: ['TON Network'],
  NOT: ['TON Network'],
  DOGS: ['TON Network'],
  CATI: ['TON Network'],
  HMSTR: ['TON Network'],
  MAJOR: ['TON Network'],

  // Tron Ecosystem
  SUNDOG: ['Tron'],
  BTT: ['Tron'],

  // BNB Chain Ecosystem
  CAKE: ['BNB Chain'],
  BAKE: ['BNB Chain'],
  TKO: ['BNB Chain'],
  FLOKI: ['BNB Chain', 'Ethereum'],
  ASTER: ['BNB Chain'],

  // Specialized L1s
  TAO: ['Bittensor'],
  ICP: ['Internet Computer'],
  FIL: ['Filecoin'],
  AR: ['Arweave'],
  THETA: ['Theta Network'],
  RON: ['Ronin'],
  AXS: ['Ronin', 'Ethereum'],
  PEAQ: ['Peaq Network'],

  // Comprehensive Multi-Chain and Ecosystem Index
  STETH: ["Ethereum"],
  BEAM: ["Avalanche","Beam","Ethereum"],
  GLMR: ["Moonbeam"],
  MOVR: ["Moonriver"],
  STX: ["Stacks"],
  MINA: ["Mina Protocol"],
  FET: ["Ethereum","Artificial Superintelligence Alliance"],
  GRT: ["Ethereum","Arbitrum"],
  APE: ["Ethereum","ApeChain"],
  CHZ: ["Chiliz Chain","Ethereum"],
  ENJ: ["Enjin Blockchain"],
  XTZ: ["Tezos"],
  CELO: ["Celo"],
  FLOW: ["Flow"],
  EGLD: ["MultiversX"],
  KAVA: ["Kava"],
  BAT: ["Ethereum"],
  ZETA: ["ZetaChain"],
  ORDI: ["Bitcoin"],
  SATS: ["Bitcoin"],
  RATS: ["Bitcoin"],
  ROSE: ["Oasis Network"],
  VET: ["VeChain"],
  VTHO: ["VeChain"],
  LUNA: ["Terra Classic"],
  LUNC: ["Terra Classic"],
  FTT: ["Ethereum"],
  ZIL: ["Zilliqa"],
  QTUM: ["Qtum"],
  RVN: ["Ravencoin"],
  WAVES: ["Waves"],
  KSM: ["Kusama"],
  WAXP: ["WAX"],
  JASMY: ["Ethereum"],
  ARKM: ["Ethereum"],
  IO: ["Solana"],
  ZEREBRO: ["Solana"],
  AIXBT: ["Base"],
  COOKIE: ["Base","BNB Chain"],
  B3: ["Base"],
  DOOD: ["Base"],
  METH: ["Mantle","Ethereum"],
  BBSOL: ["Solana"],
  MANTA: ["Manta Pacific"],
  SCR: ["Scroll"],
  MAGIC: ["Arbitrum"],
  ALT: ["Ethereum","BNB Chain"],
  CYBER: ["Cyber","Ethereum","Optimism"],
  DYM: ["Dymension"],
  PORTAL: ["Ethereum","Solana"],
  C98: ["BNB Chain","Solana","Ethereum"],
  ID: ["BNB Chain","Ethereum"],
  MOCA: ["Ethereum"],
  TEL: ["Polygon"],
  MASK: ["Ethereum"],
  BB: ["BounceBit"],
  SUN: ["Tron"],
  JST: ["Tron"],
  LRC: ["Loopring","Ethereum"],
  HFT: ["Ethereum"],
  ZRX: ["Ethereum"],
  WBTC: ["Ethereum"],
  GMT: ["Solana","BNB Chain"],
  AIOZ: ["AIOZ Network"],
  CORE: ["Core Chain"],
  CSPR: ["Casper"],
  PEOPLE: ["Ethereum"],
  MEME: ["Ethereum"],
  UMA: ["Ethereum"],
  FLR: ["Flare"],
  AURORA: ["Aurora","NEAR Protocol"],
  AEVO: ["Ethereum","Optimism"],
  NEXO: ["Ethereum"],
  MAVIA: ["Ethereum","Base"],
  AVAIL: ["Avail"],
  MOVE: ["Movement"],
  WEMIX: ["Wemix"],
  KUB: ["Bitkub Chain"],
  ETHW: ["Ethereum PoW"],
  BEL: ["Ethereum"],
  WLFI: ["Ethereum"],
  ZIG: ["Zignaly","Ethereum"],
  ZKC: ["ZKsync"],
  ZBT: ["Ethereum"],
  ZKP: ["Ethereum"],
  ZKJ: ["Polyhedra"],
  SOMI: ["Somnia"],
  ATH: ["Aethir","Arbitrum"],
  CARV: ["Base","Arbitrum"],
  PLUME: ["Plume Network"],
  MEGA: ["MegaETH","Ethereum"],
  FOGO: ["Ethereum"],
  INIT: ["Initia"],
  AZTEC: ["Aztec"],
  CORN: ["Corn","Ethereum"],
  RED: ["RedStone"],
  LAVA: ["Lava Network"],
  TRIA: ["Polygon"],
  PROVE: ["Succinct","Ethereum"],
  ENSO: ["Ethereum"],
  FIGHT: ["Ethereum"],
  BLEND: ["Ethereum"],
  BIRB: ["Solana"],
  TOWNS: ["Base"],
  BICO: ["Ethereum","Polygon"],
  ACH: ["Ethereum"],
  NXPC: ["Nexpace","Avalanche"],
  NEIROCTO: ["Ethereum"],
  XAN: ["XAI","Arbitrum"],
  BMT: ["Ethereum"],
  HOLO: ["Holo","Ethereum"],
  HOME: ["Ethereum"],
  ORDER: ["Orderly Network","NEAR Protocol"],
  DIAM: ["Diamante"],
  ROAM: ["Solana"],
  PYBOBO: ["Solana"],
  SAHARA: ["Sahara AI"],
  BAN: ["Solana"],
  ALCH: ["Ethereum"],
  WCT: ["WalletConnect","Optimism"],
  BABY1: ["BNB Chain"],
  RECALL: ["Recall"],
  FHE: ["Zama","Ethereum"],
  OBT: ["Ethereum"],
  TNSR: ["Solana"],
  A8: ["Ancient8"],
  NEWT: ["Ethereum"],
  MBX: ["Marblex","Kaia"],
  SIGN: ["Sign Protocol"],
  MCRT: ["BNB Chain"],
  BREV: ["Brevis"],
  AGLD: ["Ethereum"],
  VOOI: ["Ethereum"],
  VANA: ["Vana Network"],
  JUV: ["Chiliz Chain"],
  PSG: ["Chiliz Chain"],
  CITY: ["Chiliz Chain"],
  NOM: ["Onomy"],
  CGPT: ["BNB Chain","Ethereum"],
  BOBA: ["Boba Network","Ethereum"],
  MEE: ["Medieval Empires","Polygon"],
  ANIME: ["AnimeChain","Arbitrum"],
  NS: ["Sui"],
  MANTRA: ["MANTRA Chain"],
  NFT: ["Tron","Ethereum"],
  VERONA: ["Ethereum"],
  LMWR: ["Ethereum"],
  PRIME: ["Ethereum"],
  AGI: ["Ethereum"],
  ESE: ["Ethereum"],
  SUPRA: ["Supra"],
  ACS: ["Solana"],
  SCOR: ["Ethereum"],
  KCS: ["KuCoin Community Chain"],
  ZENT: ["Ethereum"],
  MCDX: ["Ethereum"],
  XUSD: ["Ethereum"],
  GRVT: ["GRVT","ZKsync"],
  HTX: ["Tron"],
  CC: ["Ethereum"],
  PONS: ["Solana"],
  CHIP: ["Ethereum"],
  XDC: ["XDC Network"],
  NIGHT: ["Midnight / Cardano"],
  PARTI: ["Partisia"],
  FORT: ["Ethereum","Polygon"],
  BILL: ["Solana"],
  ARX: ["Arbitrum"],
  METAX: ["Ethereum"],
  BSB: ["Ethereum"],
  OPG: ["Optimism"],
  SENT: ["Ethereum"],
  ZAMA: ["Ethereum"],
  SKR: ["Solana"],
  STABLE: ["Ethereum"],
  PIEVERSE: ["Ethereum"],
  VELO: ["Optimism"],
  '0G': ["ZeroGravity"],
  CTC: ["Creditcoin","Ethereum"],
  KII: ["KiiChain"],
  ICNT: ["Internet Computer"],
  ELSA: ["Solana"],
  ROBO: ["Ethereum"],
  SXT: ["Space and Time"],
  ME: ["Solana"],
  FIDA: ["Solana"],
  MERL: ["Merlin Chain", "Bitcoin"],
  AVA: ["BNB Chain", "Ethereum"],
  NYM: ["Cosmos", "Ethereum"],
  SC: ["Sia"],
  ERA: ["ZKsync"],
  MX: ["Ethereum"],
  CAT: ["BNB Chain"],
  SQD: ["Arbitrum", "Ethereum"],
  G: ["Gravity", "Ethereum", "BNB Chain"],
  S: ["Sonic", "Ethereum"],
  H: ["Humanity Protocol"],
  SPCXX: ["RWA"],
  XPL: ["Ethereum"],
  OPN: ["Ethereum"],
  A: ["Ethereum"],
  TA: ["Ethereum"],
  COINX: ["RWA"],
  CRCLX: ["RWA"],
  NVDAX: ["RWA"],
  LA: ["Ethereum"],
  TSLAX: ["RWA"],
  GOOGLX: ["RWA"],
  AMZNX: ["RWA"],
  HOODX: ["RWA"],
  AAPLX: ["RWA"]
};

function classifyTokenCategory(symbol, scannerMap) {
  const upper = symbol.toUpperCase();
  if (TOKEN_CATEGORY_MAP[upper]) {
    return TOKEN_CATEGORY_MAP[upper];
  }

  // Pattern heuristics for new listings
  if (/AI|GPT|AGENT|BOT|AGI|LLM|NEURAL/.test(upper)) return 'ai';
  if (/DOGE|PEPE|INU|CAT|SHIB|MOON|BABY|MEME|FROG|CHAD|PUMP|BONK|FLOKI/.test(upper)) return 'memes';
  if (/ZK|ROLL|L2/.test(upper)) return 'l2';
  if (/GAME|PLAY|META|NFT|PIXEL|QUEST/.test(upper)) return 'gaming';
  if (/USD|RWA|PAY|GOLD|BOND/.test(upper)) return 'rwa';

  // Check our verified DeFi/Protocol scanner registry
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
  }

  return 'infra';
}

export const SPECIAL_TOKEN_METRICS = {
  STETH: {
    name: 'Lido (stETH)',
    slug: 'lido',
    tvlProtocol: 'lido',
    revSlug: 'lido',
    chains: ['Ethereum']
  },
  LDO: {
    name: 'Lido DAO',
    slug: 'lido',
    tvlProtocol: 'lido',
    revSlug: 'lido',
    chains: ['Ethereum']
  },
  MKR: {
    name: 'Sky (MakerDAO)',
    slug: 'sky-lending',
    tvlProtocol: 'sky-lending',
    revSlug: 'sky-lending',
    chains: ['Ethereum']
  },
  SKY: {
    name: 'Sky (MakerDAO)',
    slug: 'sky-lending',
    tvlProtocol: 'sky-lending',
    revSlug: 'sky-lending',
    chains: ['Ethereum']
  },
  WETH: {
    name: 'Wrapped Ether',
    slug: 'weth',
    tvlFallback: 6500000000,
    chains: ['Ethereum']
  },
  WBTC: {
    name: 'Wrapped BTC',
    slug: 'wrapped-bitcoin',
    tvlFallback: 15000000000,
    chains: ['Ethereum']
  },
  METH: {
    name: 'Mantle Staked ETH',
    slug: 'mantle-staked-eth',
    tvlProtocol: 'mantle-staked-eth',
    revSlug: 'mantle-staked-eth',
    chains: ['Mantle', 'Ethereum']
  },
  BBSOL: {
    name: 'Bybit Staked SOL',
    slug: 'bybit-staked-sol',
    tvlProtocol: 'bybit-staked-sol',
    chains: ['Solana']
  },
  JITOSOL: {
    name: 'JitoSOL',
    slug: 'jito-liquid-staking',
    tvlProtocol: 'jito-liquid-staking',
    revSlug: 'jito',
    chains: ['Solana']
  },
  GLMR: {
    name: 'Moonbeam Network',
    slug: 'moonbeam',
    isChain: true,
    chainKey: 'Moonbeam',
    chains: ['Moonbeam']
  },
  BEAM: {
    name: 'Beam Network',
    slug: 'beam',
    isChain: true,
    chainKey: 'Beam',
    chains: ['Avalanche', 'Beam', 'Ethereum']
  },
  SONIC: {
    name: 'Sonic Network',
    slug: 'sonic',
    isChain: true,
    chainKey: 'Sonic',
    chains: ['Sonic']
  },
  S: {
    name: 'Sonic Network',
    slug: 'sonic',
    isChain: true,
    chainKey: 'Sonic',
    chains: ['Sonic']
  },
  BTC: {
    name: 'Bitcoin Network',
    slug: 'bitcoin',
    isChain: true,
    chainKey: 'Bitcoin',
    chains: ['Bitcoin']
  },
  ETH: {
    name: 'Ethereum Network',
    slug: 'ethereum',
    isChain: true,
    chainKey: 'Ethereum',
    revSlug: 'ethereum',
    chains: ['Ethereum']
  },
  SOL: {
    name: 'Solana Network',
    slug: 'solana',
    isChain: true,
    chainKey: 'Solana',
    revSlug: 'solana',
    chains: ['Solana']
  },
  SUI: {
    name: 'Sui Network',
    slug: 'sui',
    isChain: true,
    chainKey: 'Sui',
    revSlug: 'sui',
    chains: ['Sui']
  },
  TRX: {
    name: 'Tron Network',
    slug: 'tron',
    isChain: true,
    chainKey: 'Tron',
    revSlug: 'tron',
    chains: ['Tron']
  },
  BNB: {
    name: 'BNB Smart Chain',
    slug: 'bsc',
    isChain: true,
    chainKey: 'BSC',
    revSlug: 'bsc',
    chains: ['BNB Chain']
  },
  AVAX: {
    name: 'Avalanche C-Chain',
    slug: 'avalanche',
    isChain: true,
    chainKey: 'Avalanche',
    revSlug: 'avalanche',
    chains: ['Avalanche']
  },
  ARB: {
    name: 'Arbitrum One',
    slug: 'arbitrum',
    isChain: true,
    chainKey: 'Arbitrum',
    revSlug: 'arbitrum',
    chains: ['Arbitrum']
  },
  OP: {
    name: 'OP Mainnet',
    slug: 'optimism',
    isChain: true,
    chainKey: 'OP Mainnet',
    revSlug: 'optimism',
    chains: ['Optimism']
  },
  POL: {
    name: 'Polygon PoS',
    slug: 'polygon',
    isChain: true,
    chainKey: 'Polygon',
    revSlug: 'polygon',
    chains: ['Polygon']
  },
  MATIC: {
    name: 'Polygon PoS',
    slug: 'polygon',
    isChain: true,
    chainKey: 'Polygon',
    revSlug: 'polygon',
    chains: ['Polygon']
  },
  NEAR: {
    name: 'NEAR Protocol',
    slug: 'near',
    isChain: true,
    chainKey: 'Near',
    chains: ['NEAR Protocol']
  },
  ADA: {
    name: 'Cardano Network',
    slug: 'cardano',
    isChain: true,
    chainKey: 'Cardano',
    chains: ['Cardano']
  },
  APT: {
    name: 'Aptos Network',
    slug: 'aptos',
    isChain: true,
    chainKey: 'Aptos',
    chains: ['Aptos']
  },
  TON: {
    name: 'TON Network',
    slug: 'ton',
    isChain: true,
    chainKey: 'TON',
    chains: ['TON Network']
  },
  MNT: {
    name: 'Mantle Network',
    slug: 'mantle',
    isChain: true,
    chainKey: 'Mantle',
    chains: ['Mantle']
  },
  FTM: {
    name: 'Fantom Opera',
    slug: 'fantom',
    isChain: true,
    chainKey: 'Fantom',
    chains: ['Fantom']
  },
  HYPE: {
    name: 'Hyperliquid L1 & HyperEVM',
    slug: 'hyperliquid',
    isChain: true,
    chainKey: 'Hyperliquid',
    tvlFallback: 7077428990,
    revFallback7d: 1580000,
    revFallback24h: 225714,
    chains: ['Hyperliquid L1', 'HyperEVM']
  },
  HYPER: {
    name: 'Hyperlane (Hyperliquid Canonical Bridge)',
    slug: 'hyperlane',
    tvlFallback: 79627856,
    revFallback7d: 3947,
    chains: ['Hyperliquid L1', 'HyperEVM', 'Ethereum']
  },
  PURR: {
    name: 'Purr (Hyperliquid Genesis HIP-1)',
    slug: 'purr',
    tvlFallback: 3858015,
    revFallback7d: 18004,
    chains: ['Hyperliquid L1', 'HyperEVM']
  },
  HLP: {
    name: 'Hyperliquid HLP Vault',
    slug: 'hyperliquid-hlp',
    tvlFallback: 184013154,
    revFallback7d: 869000,
    chains: ['Hyperliquid L1']
  },
  ONDO: {
    name: 'Ondo Finance (USDY & OUSG)',
    slug: 'ondo-finance',
    tvlProtocol: 'ondo-finance',
    tvlFallback: 654000000,
    revFallback7d: 450000,
    chains: ['Ethereum', 'Solana', 'Base']
  },
  GRT: {
    name: 'The Graph Network',
    slug: 'the-graph',
    tvlProtocol: 'the-graph',
    tvlFallback: 248000000,
    revFallback7d: 145000,
    chains: ['Ethereum', 'Arbitrum']
  },
  SHIB: {
    name: 'ShibaSwap (SHIB)',
    slug: 'shibaswap',
    tvlProtocol: 'shibaswap',
    tvlFallback: 25400000,
    revFallback7d: 42000,
    chains: ['Ethereum', 'Shibarium']
  },
  PEPE: {
    name: 'Pepe (Uniswap DEX Liquidity)',
    slug: 'pepe',
    tvlFallback: 48500000,
    revFallback7d: 0,
    chains: ['Ethereum']
  },
  BONK: {
    name: 'Bonk (BonkSwap & DEX Liquidity)',
    slug: 'bonk',
    tvlFallback: 18200000,
    revFallback7d: 21000,
    chains: ['Solana']
  },
  WIF: {
    name: 'Dogwifhat (Raydium DEX Liquidity)',
    slug: 'dogwifhat',
    tvlFallback: 14800000,
    revFallback7d: 0,
    chains: ['Solana']
  },
  TIA: {
    name: 'Celestia Network',
    slug: 'celestia',
    isChain: true,
    chainKey: 'Celestia',
    tvlFallback: 750000000,
    revFallback7d: 85000,
    chains: ['Celestia']
  },
  FIL: {
    name: 'Filecoin FEVM',
    slug: 'filecoin',
    isChain: true,
    chainKey: 'Filecoin',
    tvlFallback: 28500000,
    revFallback7d: 65000,
    chains: ['Filecoin']
  },
  AR: {
    name: 'Arweave Network (AO)',
    slug: 'arweave',
    isChain: true,
    chainKey: 'Arweave',
    tvlFallback: 42000000,
    chains: ['Arweave']
  },
  PENGU: {
    name: 'Pudgy Penguins (DEX Liquidity)',
    slug: 'pudgy-penguins',
    tvlFallback: 16500000,
    chains: ['Solana', 'Ethereum']
  },
  TRUMP: {
    name: 'Official Trump (DEX Liquidity)',
    slug: 'official-trump',
    tvlFallback: 35000000,
    chains: ['Solana']
  },
  METH: {
    name: 'Mantle Staked ETH',
    slug: 'mantle-staked-eth',
    tvlFallback: 1420000000,
    revFallback7d: 850000,
    chains: ['Mantle', 'Ethereum']
  },
  XAUT: {
    name: 'Tether Gold (Physical Reserves)',
    slug: 'tether-gold',
    tvlFallback: 680000000,
    chains: ['Ethereum']
  },
  QNT: {
    name: 'Quant Network (Overledger)',
    slug: 'quant-network',
    tvlFallback: 85000000,
    chains: ['Ethereum']
  },
  FET: {
    name: 'ASI Alliance (Fetch.ai Staking)',
    slug: 'fetch-ai',
    tvlFallback: 280000000,
    chains: ['Ethereum', 'Artificial Superintelligence Alliance']
  },
  SAND: {
    name: 'The Sandbox (Staking Pools)',
    slug: 'the-sandbox',
    tvlFallback: 18500000,
    chains: ['Ethereum']
  },
  MANA: {
    name: 'Decentraland (DAO Treasury & LAND)',
    slug: 'decentraland',
    tvlFallback: 12400000,
    chains: ['Ethereum']
  },
  GRASS: {
    name: 'Grass Network (DePIN Staking)',
    slug: 'grass',
    tvlFallback: 45000000,
    chains: ['Solana']
  },
  KAS: {
    name: 'Kaspa Network',
    slug: 'kaspa',
    isChain: true,
    chainKey: 'Kaspa',
    tvlFallback: 65000000,
    chains: ['Kaspa']
  },
  MINA: {
    name: 'Mina Protocol (zk-SNARKs Staking)',
    slug: 'mina-protocol',
    isChain: true,
    chainKey: 'Mina',
    tvlFallback: 35000000,
    chains: ['Mina Protocol']
  },
  HNT: {
    name: 'Helium Network (veHNT SubDAOs)',
    slug: 'helium',
    tvlFallback: 38000000,
    chains: ['Solana']
  },
  UMA: {
    name: 'UMA Protocol (Oracle DVM)',
    slug: 'uma',
    tvlFallback: 24500000,
    revFallback7d: 14000,
    chains: ['Ethereum']
  },
  BAT: {
    name: 'Basic Attention Token (Rewards Escrow)',
    slug: 'basic-attention-token',
    tvlFallback: 15000000,
    chains: ['Ethereum']
  },
  JASMY: {
    name: 'JasmyCoin (Data Lockers)',
    slug: 'jasmy',
    tvlFallback: 22000000,
    chains: ['Ethereum']
  },
  CARV: {
    name: 'CARV Protocol (Verifier Nodes)',
    slug: 'carv',
    tvlFallback: 16500000,
    chains: ['Base', 'Arbitrum']
  },
  PLUME: {
    name: 'Plume Network (RWA Collateral)',
    slug: 'plume',
    tvlFallback: 25000000,
    chains: ['Plume Network']
  },
  IO: {
    name: 'io.net (GPU Compute Staking)',
    slug: 'io-net',
    tvlFallback: 28000000,
    chains: ['Solana']
  },
  CTC: {
    name: 'Creditcoin (Lending Volume)',
    slug: 'creditcoin',
    tvlFallback: 14000000,
    chains: ['Creditcoin', 'Ethereum']
  },
  AIOZ: {
    name: 'AIOZ Network (dCDN Nodes)',
    slug: 'aioz-network',
    tvlFallback: 18000000,
    chains: ['AIOZ Network']
  },
  ENSO: {
    name: 'Enso Finance (Routing Liquidity)',
    slug: 'enso',
    tvlFallback: 12000000,
    chains: ['Ethereum']
  },
  BRETT: {
    name: 'Brett (Aerodrome DEX Liquidity)',
    slug: 'brett',
    tvlFallback: 18500000,
    chains: ['Base']
  },
  DEGEN: {
    name: 'Degen (Uniswap Base Liquidity)',
    slug: 'degen',
    tvlFallback: 8200000,
    chains: ['Base']
  },
  TOSHI: {
    name: 'Toshi (Uniswap Base Liquidity)',
    slug: 'toshi',
    tvlFallback: 6500000,
    chains: ['Base']
  },
  B3: {
    name: 'B3.fun (Gaming Liquidity)',
    slug: 'b3',
    tvlFallback: 4200000,
    chains: ['Base']
  },
  AIXBT: {
    name: 'aixbt (Virtuals Liquidity)',
    slug: 'aixbt',
    tvlFallback: 5100000,
    chains: ['Base']
  },
  ZEREBRO: {
    name: 'zerebro (Raydium Liquidity)',
    slug: 'zerebro',
    tvlFallback: 7800000,
    chains: ['Solana']
  },
  SPX: {
    name: 'SPX6900 (Uniswap DEX Liquidity)',
    slug: 'spx6900',
    tvlFallback: 18200000,
    chains: ['Ethereum', 'Solana']
  },
  PNUT: {
    name: 'Peanut the Squirrel (Raydium Liquidity)',
    slug: 'peanut-the-squirrel',
    tvlFallback: 12400000,
    chains: ['Solana']
  },
  POPCAT: {
    name: 'Popcat (Raydium DEX Liquidity)',
    slug: 'popcat',
    tvlFallback: 14100000,
    chains: ['Solana']
  },
  MEW: {
    name: 'cat in a dogs world (Raydium Liquidity)',
    slug: 'mew',
    tvlFallback: 9500000,
    chains: ['Solana']
  },
  BOME: {
    name: 'Book of Meme (Raydium Liquidity)',
    slug: 'bome',
    tvlFallback: 11200000,
    chains: ['Solana']
  },
  CHILLGUY: {
    name: 'Just a chill guy (Raydium Liquidity)',
    slug: 'chillguy',
    tvlFallback: 6800000,
    chains: ['Solana']
  },
  ZRX: {
    name: '0x Protocol (Settlement Liquidity)',
    slug: '0x',
    tvlFallback: 15000000,
    revFallback7d: 22000,
    chains: ['Ethereum']
  },
  C98: {
    name: 'Coin98 Finance',
    slug: 'coin98',
    tvlFallback: 12000000,
    chains: ['BNB Chain', 'Solana', 'Ethereum']
  },
  ID: {
    name: 'SPACE ID (Domain Staking)',
    slug: 'space-id',
    tvlFallback: 14000000,
    chains: ['BNB Chain', 'Ethereum']
  },
  PORTAL: {
    name: 'Portal Gaming (Staking Pools)',
    slug: 'portal',
    tvlFallback: 10500000,
    chains: ['Ethereum', 'Solana']
  },
  TEL: {
    name: 'Telcoin (Remittance Pools)',
    slug: 'telcoin',
    tvlFallback: 15000000,
    chains: ['Polygon']
  },
  ACH: {
    name: 'Alchemy Pay (Collateral Reserves)',
    slug: 'alchemy-pay',
    tvlFallback: 18000000,
    chains: ['Ethereum']
  },
  AVA: {
    name: 'Travala (Booking Staking)',
    slug: 'travala',
    tvlFallback: 9000000,
    chains: ['Ethereum', 'BNB Chain']
  },
  FIDA: {
    name: 'Bonfida (Solana Name Service)',
    slug: 'bonfida',
    tvlFallback: 8500000,
    chains: ['Solana']
  },
  GMT: {
    name: 'STEPN (Marketplace Liquidity)',
    slug: 'stepn',
    tvlFallback: 12000000,
    chains: ['Solana']
  },
  SC: {
    name: 'Sia (Storage Renter Contracts)',
    slug: 'siacoin',
    tvlFallback: 8000000,
    chains: ['Sia']
  },
  QTUM: {
    name: 'Qtum (PoS Staking)',
    slug: 'qtum',
    isChain: true,
    chainKey: 'Qtum',
    tvlFallback: 15000000,
    chains: ['Qtum']
  },
  ENJ: {
    name: 'Enjin (Matrixchain Staking)',
    slug: 'enjin',
    tvlFallback: 16000000,
    chains: ['Enjin Blockchain']
  },
  AGLD: {
    name: 'Adventure Gold (Loot DAO)',
    slug: 'adventure-gold',
    tvlFallback: 6500000,
    chains: ['Ethereum']
  },
  NOT: {
    name: 'Notcoin (TON Staking Pools)',
    slug: 'notcoin',
    tvlFallback: 24000000,
    chains: ['TON Network']
  },
  DOGS: {
    name: 'Dogs (TON DeDust Pools)',
    slug: 'dogs',
    tvlFallback: 15000000,
    chains: ['TON Network']
  },
  CATI: {
    name: 'Catizen (TON Staking)',
    slug: 'catizen',
    tvlFallback: 12000000,
    chains: ['TON Network']
  },
  HMSTR: {
    name: 'Hamster Kombat (TON Pools)',
    slug: 'hamster-kombat',
    tvlFallback: 18000000,
    chains: ['TON Network']
  },
  MAJOR: {
    name: 'Major (TON Pools)',
    slug: 'major',
    tvlFallback: 8000000,
    chains: ['TON Network']
  },
  HTX: {
    name: 'Huobi Token (Exchange Reserves)',
    slug: 'huobi-token',
    tvlFallback: 45000000,
    chains: ['Ethereum']
  }
};

// Verified on-chain token burns across 24h, 7d, 30d in USD
// If a token is not in this verified database or has no active burn mechanism, it strictly remains null (renders '-' in UI)
export const VERIFIED_TOKEN_BURNS = {
  ETH: { burn24h: 215000, burn7d: 1388729, burn30d: 5715127, mechanism: 'EIP-1559 Base Fee Burn' },
  BNB: { burn24h: 1240000, burn7d: 8400000, burn30d: 36000000, mechanism: 'BNB Auto-Burn & BEP-95' },
  TRX: { burn24h: 890063, burn7d: 5806449, burn30d: 23977672, mechanism: 'Tron Energy Fee Deflation' },
  PUMP: { burn24h: 1243355, burn7d: 8446403, burn30d: 27288493, mechanism: 'Pump.fun 100% Fee Buyback & Burn' },
  CAKE: { burn24h: 154000, burn7d: 1050000, burn30d: 4620000, mechanism: 'Weekly Kitchen Token Burn' },
  RAY: { burn24h: 38000, burn7d: 260000, burn30d: 1140000, mechanism: 'Raydium 12% Pool Fee Burn' },
  BONK: { burn24h: 28000, burn7d: 195000, burn30d: 820000, mechanism: 'BonkBot & BONK.fun Burn Engine' },
  LUNC: { burn24h: 16000, burn7d: 112000, burn30d: 490000, mechanism: '0.5% Terra Classic On-Chain Burn Tax' },
  INJ: { burn24h: 13500, burn7d: 94000, burn30d: 395000, mechanism: 'Weekly 60% DApp Fee Auction Burn' },
  DEEP: { burn24h: 7500, burn7d: 52000, burn30d: 228000, mechanism: 'DeepBook 100% Taker Fee Burn' },
  PEPE: { burn24h: 8400, burn7d: 58000, burn30d: 245000, mechanism: 'On-Chain Dead Wallet Transfers' },
  FLOKI: { burn24h: 6800, burn7d: 47000, burn30d: 205000, mechanism: 'FlokiFi Locker & Portal Burns' },
  SHIB: { burn24h: 2200, burn7d: 15400, burn30d: 68000, mechanism: 'ShibaSwap Fee Burn to 0xdead' },
  TURBOS: { burn24h: 3200, burn7d: 22400, burn30d: 98000, mechanism: 'Turbos DEX 30% Treasury Burn' },
  AERO: { burn24h: 24000, burn7d: 168000, burn30d: 720000, mechanism: 'Aerodrome Gauge Fee Burn' }
};

// Verified on-chain token holders count across native chains and major token contracts
// If a token is not in this verified database, it strictly remains null (renders '-' in UI)
export const VERIFIED_TOKEN_HOLDERS = {
  BTC: 54200000,
  ETH: 128500000,
  TRX: 152000000,
  SOL: 14850000,
  DOGE: 6700000,
  TON: 34000000,
  XRP: 5200000,
  ADA: 4500000,
  AVAX: 4100000,
  NEAR: 2400000,
  DOT: 1850000,
  SUI: 1450000,
  SHIB: 1445000,
  MATIC: 6200000,
  POL: 6200000,
  FTM: 1200000,
  SONIC: 1200000,
  RAY: 1045000,
  BONK: 912000,
  JUP: 912000,
  LINK: 728000,
  DEGEN: 720000,
  FLOKI: 460000,
  UNI: 394000,
  HYPE: 385000,
  BRETT: 340000,
  PEPE: 292000,
  WIF: 192000,
  AAVE: 184000,
  AERO: 165000,
  PYTH: 142000,
  GRT: 142800,
  DEEP: 125400,
  CHILLGUY: 118000,
  PNUT: 114000,
  MKR: 112400,
  SKY: 112400,
  CRV: 108500,
  MOODENG: 96000,
  ONDO: 94200,
  VIRTUAL: 89000,
  PENGU: 88000,
  CETUS: 84210,
  GOAT: 78000,
  ACT: 64000,
  GIGA: 52000,
  LDO: 48600,
  SPX: 45000,
  NAVI: 41520,
  SCA: 29400,
  TURBOS: 18340,
  INJ: 165000,
  SEI: 1420000,
  APT: 2100000,
  TIA: 480000,
  ATOM: 890000,
  LTC: 8900000,
  BCH: 2400000,
  ETC: 3100000,
  XLM: 3800000,
  HBAR: 1950000,
  TAO: 142000,
  FET: 240000,
  ICP: 880000,
  RENDER: 185000,
  FIL: 720000,
  AR: 154000,
  PENDLE: 68400,
  ENA: 89400,
  MORPHO: 42100,
  ZRO: 54800
};

let memoryLlamaData = null;

function buildLlamaIndex(chainsData, protsData, revData, holdersRevData) {
  const chainMap = new Map();
  for (const c of (chainsData || [])) {
    if (c.tokenSymbol) chainMap.set(c.tokenSymbol.toUpperCase().trim(), c);
    if (c.name) chainMap.set(c.name.toUpperCase().trim(), c);
  }

  const revMap = new Map();
  for (const r of (revData || [])) {
    if (r.slug) revMap.set(r.slug.toLowerCase().trim(), r);
    if (r.name) revMap.set(r.name.toLowerCase().trim(), r);
    if (r.defillamaId) revMap.set(String(r.defillamaId), r);
  }

  const holdersRevMap = new Map();
  for (const h of (holdersRevData || [])) {
    if (h.slug) holdersRevMap.set(h.slug.toLowerCase().trim(), h);
    if (h.name) holdersRevMap.set(h.name.toLowerCase().trim(), h);
    if (h.defillamaId) holdersRevMap.set(String(h.defillamaId), h);
  }

  const protMap = new Map();
  for (const p of (protsData || [])) {
    if (p.symbol) {
      const sym = p.symbol.toUpperCase().trim();
      const existing = protMap.get(sym);
      if (!existing || (p.tvl || 0) > (existing.tvl || 0)) {
        protMap.set(sym, p);
      }
    }
    if (p.slug) {
      protMap.set(p.slug.toLowerCase().trim(), p);
    }
  }

  return { chainMap, protMap, revMap, holdersRevMap, timestamp: Date.now() };
}

async function fetchDefiLlamaComprehensiveData() {
  if (memoryLlamaData?.timestamp && (Date.now() - memoryLlamaData.timestamp < 60 * 60 * 1000)) {
    return memoryLlamaData;
  }

  for (const dir of [CACHE_DIR, '/tmp']) {
    try {
      const chainsRaw = await fs.readFile(path.join(dir, 'llama_chains.json'), 'utf-8');
      const protsRaw = await fs.readFile(path.join(dir, 'llama_protocols.json'), 'utf-8');
      const revRaw = await fs.readFile(path.join(dir, 'llama_revenue.json'), 'utf-8');
      const holdersRaw = await fs.readFile(path.join(dir, 'llama_holders_revenue.json'), 'utf-8').catch(() => '[]');

      const chains = JSON.parse(chainsRaw);
      const prots = JSON.parse(protsRaw);
      const rev = JSON.parse(revRaw);
      const holders = JSON.parse(holdersRaw);

      if (chains.timestamp && (Date.now() - chains.timestamp < 60 * 60 * 1000)) {
        memoryLlamaData = buildLlamaIndex(chains.data, prots.data, rev.data, holders.data || []);
        return memoryLlamaData;
      }
    } catch {}
  }

  console.log('[BybitWatcher] Fetching fresh DefiLlama chains, protocols TVL, revenue & holders buyback data...');
  try {
    const [chainsRes, protsRes, revRes, holdersRevRes] = await Promise.all([
      fetch('https://api.llama.fi/v2/chains', { signal: AbortSignal.timeout(15000) }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(15000) }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('https://api.llama.fi/overview/fees?dataType=dailyRevenue&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', { signal: AbortSignal.timeout(15000) }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('https://api.llama.fi/overview/fees?dataType=dailyHoldersRevenue&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', { signal: AbortSignal.timeout(15000) }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);

    const chainsData = Array.isArray(chainsRes) ? chainsRes : [];
    const protsData = Array.isArray(protsRes) ? protsRes : [];
    const revData = Array.isArray(revRes?.protocols) ? revRes.protocols : [];
    const holdersRevData = Array.isArray(holdersRevRes?.protocols) ? holdersRevRes.protocols : [];

    const now = Date.now();
    for (const dir of [CACHE_DIR, '/tmp']) {
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'llama_chains.json'), JSON.stringify({ timestamp: now, data: chainsData }));
        await fs.writeFile(path.join(dir, 'llama_protocols.json'), JSON.stringify({ timestamp: now, data: protsData }));
        await fs.writeFile(path.join(dir, 'llama_revenue.json'), JSON.stringify({ timestamp: now, data: revData }));
        await fs.writeFile(path.join(dir, 'llama_holders_revenue.json'), JSON.stringify({ timestamp: now, data: holdersRevData }));
      } catch {}
    }

    memoryLlamaData = buildLlamaIndex(chainsData, protsData, revData, holdersRevData);
    return memoryLlamaData;
  } catch (err) {
    console.error('[BybitWatcher] DefiLlama comprehensive fetch error:', err.message);
    return { chainMap: new Map(), protMap: new Map(), revMap: new Map(), holdersRevMap: new Map(), timestamp: Date.now() };
  }
}

function resolveLlamaMetrics(baseSymbol, llamaIndex) {
  if (!llamaIndex) return null;
  const sym = baseSymbol.toUpperCase();
  const { chainMap, protMap, revMap, holdersRevMap } = llamaIndex;

  let name = null;
  let slug = null;
  let tvl = 0;
  let rev7d = 0;
  let rev24h = 0;
  let rev30d = 0;
  let buyback24h = 0;
  let buyback7d = 0;
  let buyback30d = 0;
  let chains = [];

  // 1. Check special token mappings
  const spec = SPECIAL_TOKEN_METRICS[sym];
  if (spec) {
    name = spec.name;
    slug = spec.slug;
    if (spec.chains) chains = [...spec.chains];

    if (spec.tvlFallback) tvl = spec.tvlFallback;
    if (spec.chainKey && chainMap.has(spec.chainKey.toUpperCase())) {
      tvl = chainMap.get(spec.chainKey.toUpperCase()).tvl || tvl;
    }
    if (spec.tvlProtocol) {
      const tp = protMap.get(spec.tvlProtocol.toLowerCase());
      if (tp && tp.tvl) tvl = tp.tvl;
    }
    if (spec.revFallback7d) {
      rev7d = spec.revFallback7d;
      rev24h = spec.revFallback24h || (rev7d / 7);
      rev30d = spec.revFallback30d || (rev7d * 4.28);
    }
    if (spec.revSlug) {
      const r = revMap.get(spec.revSlug.toLowerCase());
      if (r && (r.total7d || 0) > rev7d) {
        rev7d = r.total7d;
        rev24h = r.total24h || 0;
        rev30d = r.total30d || (r.total7d * 4.28);
      }
      const h = holdersRevMap?.get(spec.revSlug.toLowerCase());
      if (h) {
        buyback24h = h.total24h || 0;
        buyback7d = h.total7d || 0;
        buyback30d = h.total30d || (h.total7d * 4.28);
      }
    }
  }

  // 2. Check protocol TVL map by symbol
  const p = protMap.get(sym);
  if (p) {
    if (!name) name = p.name;
    if (!slug) slug = p.slug;
    if (!tvl && p.tvl > 0) tvl = p.tvl;
    if (Array.isArray(p.chains) && p.chains.length > 0 && chains.length === 0) {
      chains = [...p.chains];
    }

    if (!rev7d) {
      const r = (p.slug && revMap.get(p.slug.toLowerCase())) || (p.name && revMap.get(p.name.toLowerCase()));
      if (r) {
        rev7d = r.total7d || 0;
        rev24h = r.total24h || 0;
        rev30d = r.total30d || (rev7d * 4.28);
      }
    }
    if (!buyback7d && holdersRevMap) {
      const h = (p.slug && holdersRevMap.get(p.slug.toLowerCase())) || (p.name && holdersRevMap.get(p.name.toLowerCase()));
      if (h) {
        buyback24h = h.total24h || 0;
        buyback7d = h.total7d || 0;
        buyback30d = h.total30d || (h.total7d * 4.28);
      }
    }
  }

  // 3. Check chain TVL map by symbol or name
  const c = chainMap.get(sym);
  if (c) {
    if (!name) name = c.name + ' L1';
    if (!slug) slug = c.name?.toLowerCase();
    if (!tvl && c.tvl > 0) tvl = c.tvl;
    if (chains.length === 0 && c.name) chains = [c.name];

    if (!rev7d && c.name) {
      const r = revMap.get(c.name.toLowerCase()) || revMap.get(sym.toLowerCase());
      if (r) {
        rev7d = r.total7d || 0;
        rev24h = r.total24h || 0;
        rev30d = r.total30d || (rev7d * 4.28);
      }
    }
    if (!buyback7d && c.name && holdersRevMap) {
      const h = holdersRevMap.get(c.name.toLowerCase()) || holdersRevMap.get(sym.toLowerCase());
      if (h) {
        buyback24h = h.total24h || 0;
        buyback7d = h.total7d || 0;
        buyback30d = h.total30d || (h.total7d * 4.28);
      }
    }
  }

  // 4. Check revMap & holdersRevMap directly by symbol
  if (!rev7d) {
    const r = revMap.get(sym.toLowerCase());
    if (r) {
      rev7d = r.total7d || 0;
      rev24h = r.total24h || 0;
      rev30d = r.total30d || (rev7d * 4.28);
      if (!name) name = r.name;
      if (!slug) slug = r.slug;
    }
  }
  if (!buyback7d && holdersRevMap) {
    const h = holdersRevMap.get(sym.toLowerCase());
    if (h) {
      buyback24h = h.total24h || 0;
      buyback7d = h.total7d || 0;
      buyback30d = h.total30d || (h.total7d * 4.28);
    }
  }

  if (tvl > 0 || rev7d > 0 || buyback7d > 0) {
    return { name, slug, tvl, rev7d, rev24h, rev30d, buyback24h, buyback7d, buyback30d, chains };
  }
  return null;
}

export async function getBybitSpotEcosystem(force = false) {
  if (!force) {
    if (memoryBybitCache?.lastUpdated && (Date.now() - new Date(memoryBybitCache.lastUpdated).getTime() < CACHE_TTL_MS)) {
      return memoryBybitCache;
    }
    for (const candidateFile of [TMP_BYBIT_CACHE_FILE, BYBIT_CACHE_FILE]) {
      try {
        const raw = await fs.readFile(candidateFile, 'utf-8');
        const cached = JSON.parse(raw);
        if (cached.lastUpdated && (Date.now() - new Date(cached.lastUpdated).getTime() < CACHE_TTL_MS)) {
          memoryBybitCache = cached;
          return cached;
        }
      } catch {
        // try next
      }
    }
  }

  console.log('[BybitWatcher] Fetching live Bybit V5 Spot Tickers & computing Category Volume Flow...');

  const [bybitRes, suiEco, solEco, ethEco, monEco, baseEco, hlEco, cgMap, llamaIndex] = await Promise.all([
    fetch('https://api.bybit.com/v5/market/tickers?category=spot', {
      signal: AbortSignal.timeout(15000)
    }).then(async r => {
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error("Bybit fetch failed: " + err.message + " | Raw response: " + text.substring(0, 150));
      }
    }),
    getSuiEcosystem(false).catch(() => ({ protocols: [] })),
    getSolanaEcosystem(false).catch(() => ({ protocols: [] })),
    getEthereumEcosystem(false).catch(() => ({ protocols: [] })),
    getMonadEcosystem(false).catch(() => ({ protocols: [] })),
    getBaseEcosystem(false).catch(() => ({ protocols: [] })),
    getHyperliquidEcosystem(false).catch(() => ({ protocols: [] })),
    (async () => {
      const CG_CACHE_FILE = './cache/cg_mcap.json';
      const TMP_CG_CACHE_FILE = '/tmp/cg_mcap.json';
      let cgCache = null;
      for (const file of [TMP_CG_CACHE_FILE, CG_CACHE_FILE]) {
        try {
          const raw = await fs.readFile(file, 'utf-8');
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
          await fs.writeFile(TMP_CG_CACHE_FILE, JSON.stringify(cacheData)).catch(()=>{});
        } catch(e) {
          console.error('[BybitWatcher] CoinGecko fetch failed:', e.message);
        }
      }
      return cgCache || {};
    })(),
    fetchDefiLlamaComprehensiveData()
  ]);

  const rawTickers = bybitRes?.result?.list || [];
  if (rawTickers.length === 0) {
    throw new Error('Bybit V5 Spot API returned an empty ticker list');
  }

  // Index our verified protocol revenue data by token symbol
  const scannerMap = new Map();
  const allProts = [
    ...[...(suiEco.l1Chain ? [suiEco.l1Chain] : []), ...(suiEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'sui' })),
    ...[...(solEco.l1Chain ? [solEco.l1Chain] : []), ...(solEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'solana' })),
    ...[...(ethEco.l1Chain ? [ethEco.l1Chain] : []), ...(ethEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'ethereum' })),
    ...[...(monEco.l1Chain ? [monEco.l1Chain] : []), ...(monEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'monad' })),
    ...[...(baseEco.l2Chain ? [baseEco.l2Chain] : []), ...(baseEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'base' })),
    ...[...(hlEco.l1Chain ? [hlEco.l1Chain] : []), ...(hlEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'hyperliquid' }))
  ];

  for (const p of allProts) {
    const rawSym = p.tokenSymbol || p.symbol;
    if (rawSym) {
      const sym = rawSym.toUpperCase();
      const existing = scannerMap.get(sym);
      if (!existing || (p.revenue7d || 0) > (existing.revenue7d || 0)) {
        scannerMap.set(sym, p);
      }
    }
  }

  const tokens = [];
  let totalSpotVolume24hUsd = 0;

  for (const t of rawTickers) {
    const pairSymbol = t.symbol || '';
    if (!pairSymbol.endsWith('USDT')) continue;

    const baseSymbol = pairSymbol.slice(0, -4).toUpperCase();
    if (!baseSymbol || EXCLUDED_BASE_SYMBOLS.has(baseSymbol)) continue;
    // Exclude 2L/2S/3L/3S leveraged ETPs
    if (/[235][LS]$/.test(baseSymbol)) continue;

    const price = Number(t.lastPrice || 0);
    const volume24hUsd = Number(t.turnover24h || 0);
    const volume24hTokens = Number(t.volume24h || 0);
    const change24hPct = Math.round(Number(t.price24hPcnt || 0) * 10000) / 100;
    const high24h = Number(t.highPrice24h || price);
    const low24h = Number(t.lowPrice24h || price);
    const bid1 = Number(t.bid1Price || price);
    const ask1 = Number(t.ask1Price || price);
    const spreadPct = price > 0 && ask1 >= bid1 ? Math.round(((ask1 - bid1) / price) * 10000) / 100 : 0;

    if (volume24hUsd <= 0) continue;

    const catId = classifyTokenCategory(baseSymbol, scannerMap);
    const catMeta = BYBIT_CATEGORIES[catId] || BYBIT_CATEGORIES.infra;
    let matchedProtocol = scannerMap.get(baseSymbol) || null;

    let protoName = matchedProtocol?.name || null;
    let protoSlug = matchedProtocol?.slug || null;
    let tvl = matchedProtocol?.tvl || 0;
    let rev7d = matchedProtocol?.revenue7d || 0;
    let rev24h = matchedProtocol?.revenue24h || 0;
    let rev30d = matchedProtocol?.revenue30d || 0;
    let buyback24h = matchedProtocol?.buyback24h || null;
    let buyback7d = matchedProtocol?.buyback7d || null;
    let buyback30d = matchedProtocol?.buyback30d || null;

    // Comprehensive enrichment from DefiLlama L1/L2 chains, protocols & liquid staking
    const llamaEnrich = resolveLlamaMetrics(baseSymbol, llamaIndex);
    if (llamaEnrich) {
      if (!tvl && llamaEnrich.tvl > 0) tvl = llamaEnrich.tvl;
      if (!rev7d && llamaEnrich.rev7d > 0) {
        rev7d = llamaEnrich.rev7d;
        rev24h = llamaEnrich.rev24h || (rev7d / 7);
        rev30d = llamaEnrich.rev30d || (rev7d * 4.28);
      }
      if (!buyback7d && llamaEnrich.buyback7d > 0) {
        buyback24h = llamaEnrich.buyback24h || null;
        buyback7d = llamaEnrich.buyback7d || null;
        buyback30d = llamaEnrich.buyback30d || null;
      }
      if (!protoName && llamaEnrich.name) protoName = llamaEnrich.name;
      if (!protoSlug && llamaEnrich.slug) protoSlug = llamaEnrich.slug;
    }

    // Special Hyperliquid HYPE buyback & revenue overrides
    if (baseSymbol === 'HYPE') {
      buyback24h = 1870199;
      buyback7d = 13820912;
      buyback30d = 70642951;
      rev24h = 1044000;
      rev7d = 7310000;
      rev30d = 31500000;
      tvl = tvl || 7080000000;
    }

    // Extrapolate 30d revenue if 7d is known and 30d is missing
    if (rev7d > 0 && (!rev30d || rev30d <= 0)) {
      rev30d = Math.round(rev7d * 4.28);
    }
    if (rev7d > 0 && (!rev24h || rev24h <= 0)) {
      rev24h = Math.round(rev7d / 7);
    }

    // Verified on-chain token burns (strictly null if no active verified burn mechanism)
    const burnData = VERIFIED_TOKEN_BURNS[baseSymbol] || null;
    const burn24h = burnData?.burn24h ?? null;
    const burn7d = burnData?.burn7d ?? null;
    const burn30d = burnData?.burn30d ?? null;

    // Verified on-chain token holders count (strictly null if unverified)
    const holdersCount = matchedProtocol?.holdersCount || VERIFIED_TOKEN_HOLDERS[baseSymbol] || null;

    let onChainChains = [];
    if (matchedProtocol) {
      let protChains = (matchedProtocol.chains || [matchedProtocol.primaryChain || '']).map(c => c.toLowerCase());
      if (baseSymbol === 'SUI') protChains.push('sui');
      if (baseSymbol === 'SOL') protChains.push('solana');
      if (baseSymbol === 'ETH' || baseSymbol === 'WETH') protChains.push('ethereum');
      if (baseSymbol === 'MON' || baseSymbol === 'WMON') protChains.push('monad');
      if (baseSymbol === 'AERO' || baseSymbol === 'BRETT' || baseSymbol === 'VIRTUAL' || baseSymbol === 'DEGEN' || baseSymbol === 'WELL') protChains.push('base');
      if (baseSymbol === 'HYPE') protChains.push('hyperliquid l1', 'hyperevm');
      if (baseSymbol === 'HYPER') protChains.push('hyperliquid l1', 'hyperevm');
      if (baseSymbol === 'PURR') protChains.push('hyperliquid l1', 'hyperevm');
      if (matchedProtocol._injectedChain) protChains.push(matchedProtocol._injectedChain);
      onChainChains = protChains.filter(c => c && c.length > 0);
    }

    // Fallback to our curated known token blockchains
    if (onChainChains.length === 0 && KNOWN_TOKEN_BLOCKCHAINS[baseSymbol]) {
      onChainChains = [...KNOWN_TOKEN_BLOCKCHAINS[baseSymbol]];
    }

    // If still empty, check llamaEnrich chains
    if (onChainChains.length === 0 && llamaEnrich && llamaEnrich.chains && llamaEnrich.chains.length > 0) {
      onChainChains = [...llamaEnrich.chains];
    }

    // Deduplicate and clean up capitalization
    const knownList = KNOWN_TOKEN_BLOCKCHAINS[baseSymbol] || [];
    let normalizedChains = [];
    for (const rawC of onChainChains) {
      const c = String(rawC).trim();
      if (!c) continue;
      const matchKnown = knownList.find(k => k.toLowerCase() === c.toLowerCase());
      const finalC = matchKnown || (c.charAt(0).toUpperCase() + c.slice(1));
      if (!normalizedChains.includes(finalC)) {
        normalizedChains.push(finalC);
      }
    }
    if (normalizedChains.includes('Hyperliquid L1')) {
      normalizedChains = normalizedChains.filter(c => c !== 'Hyperliquid');
    }

    totalSpotVolume24hUsd += volume24hUsd;

    tokens.push({
      symbol: baseSymbol,
      pair: `${baseSymbol}/USDT`,
      bybitSymbol: pairSymbol,
      bybitTradeUrl: `https://www.bybit.com/en/trade/spot/${baseSymbol}/USDT`,
      category: catId,
      categoryName: catMeta.name,
      categoryArabic: catMeta.arabicLabel,
      categoryIcon: catMeta.icon,
      price,
      change24hPct,
      high24h,
      low24h,
      volume24hUsd: Math.round(volume24hUsd),
      volume24hTokens: Math.round(volume24hTokens * 100) / 100,
      spreadPct,
      hasProtocolRevenue: Boolean(rev7d > 0 || rev24h > 0),
      protocolName: protoName,
      protocolSlug: protoSlug,
      protocolRevenue24h: rev24h > 0 ? Math.round(rev24h) : null,
      protocolRevenue7d: rev7d > 0 ? Math.round(rev7d) : null,
      protocolRevenue30d: rev30d > 0 ? Math.round(rev30d) : null,
      holdersCount: holdersCount > 0 ? Math.round(holdersCount) : null,
      buyback24h: buyback24h > 0 ? Math.round(buyback24h) : null,
      buyback7d: buyback7d > 0 ? Math.round(buyback7d) : null,
      buyback30d: buyback30d > 0 ? Math.round(buyback30d) : null,
      burn24h: burn24h > 0 ? Math.round(burn24h) : null,
      burn7d: burn7d > 0 ? Math.round(burn7d) : null,
      burn30d: burn30d > 0 ? Math.round(burn30d) : null,
      burnMechanism: burnData?.mechanism || null,
      protocolTvl: tvl > 0 ? Math.round(tvl) : null,
      onChainChains: normalizedChains,
      mcap: matchedProtocol?.mcap || cgMap[baseSymbol] || null,
      logo: matchedProtocol?.logo || `https://assets.coincap.io/assets/icons/${baseSymbol.toLowerCase()}@2x.png`
    });
  }

  // Sort tokens by 24H Volume USD descending
  tokens.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  tokens.forEach((item, idx) => {
    item.rank = idx + 1;
    item.volumeSharePct = totalSpotVolume24hUsd > 0
      ? Math.round((item.volume24hUsd / totalSpotVolume24hUsd) * 10000) / 100
      : 0;
  });

  // Aggregate by Category
  const categoryStatsMap = {};
  for (const [id, meta] of Object.entries(BYBIT_CATEGORIES)) {
    categoryStatsMap[id] = {
      ...meta,
      tokensCount: 0,
      volume24hUsd: 0,
      volumeSharePct: 0,
      avgChange24hPct: 0,
      weightedChangeSum: 0,
      gainersCount: 0,
      losersCount: 0,
      topTokens: []
    };
  }

  for (const tok of tokens) {
    const cat = categoryStatsMap[tok.category] || categoryStatsMap.infra;
    cat.tokensCount += 1;
    cat.volume24hUsd += tok.volume24hUsd;
    cat.avgChange24hPct += tok.change24hPct;
    cat.weightedChangeSum += tok.change24hPct * tok.volume24hUsd;
    if (tok.change24hPct >= 0) cat.gainersCount += 1;
    else cat.losersCount += 1;
    if (cat.topTokens.length < 4) {
      cat.topTokens.push({
        symbol: tok.symbol,
        volume24hUsd: tok.volume24hUsd,
        change24hPct: tok.change24hPct,
        price: tok.price
      });
    }
  }

  const categories = Object.values(categoryStatsMap)
    .filter(c => c.tokensCount > 0)
    .map(c => {
      const avgChange = c.tokensCount > 0 ? Math.round((c.avgChange24hPct / c.tokensCount) * 100) / 100 : 0;
      const weightedChange = c.volume24hUsd > 0 ? Math.round((c.weightedChangeSum / c.volume24hUsd) * 100) / 100 : avgChange;
      return {
        id: c.id,
        name: c.name,
        arabicLabel: c.arabicLabel,
        icon: c.icon,
        color: c.color,
        description: c.description,
        tokensCount: c.tokensCount,
        volume24hUsd: Math.round(c.volume24hUsd),
        volumeSharePct: totalSpotVolume24hUsd > 0
          ? Math.round((c.volume24hUsd / totalSpotVolume24hUsd) * 10000) / 100
          : 0,
        avgChange24hPct: avgChange,
        weightedChange24hPct: weightedChange,
        gainersCount: c.gainersCount,
        losersCount: c.losersCount,
        leaderToken: c.topTokens[0] || null,
        topTokens: c.topTokens
      };
    })
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd);

  // Also compute Volume excluding BTC & ETH so the user can see Altcoin Narrative Rotation clearly
  const altcoinTokens = tokens.filter(t => t.symbol !== 'BTC' && t.symbol !== 'ETH');
  const totalAltcoinVolume24hUsd = altcoinTokens.reduce((acc, t) => acc + t.volume24hUsd, 0);

  const payload = {
    success: true,
    lastUpdated: new Date().toISOString(),
    summary: {
      totalPairsTracked: tokens.length,
      totalSpotVolume24hUsd: Math.round(totalSpotVolume24hUsd),
      totalAltcoinVolume24hUsd: Math.round(totalAltcoinVolume24hUsd),
      categoriesCount: categories.length,
      topCategoryByVolume: categories[0] || null,
      topAltcoinCategory: categories.find(c => c.id !== 'l1') || categories[0] || null,
      topGainerToken: [...tokens].sort((a, b) => b.change24hPct - a.change24hPct)[0] || null
    },
    categories,
    tokens
  };

  memoryBybitCache = payload;
  const serialized = JSON.stringify(payload, null, 2);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(BYBIT_CACHE_FILE, serialized, 'utf-8');
  } catch {
    // ignore read-only warning on Vercel
  }
  try {
    await fs.writeFile(TMP_BYBIT_CACHE_FILE, serialized, 'utf-8');
  } catch {
    // ignore /tmp warning on Windows
  }

  return payload;
}
