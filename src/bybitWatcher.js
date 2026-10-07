import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSuiEcosystem } from './suiWatcher.js';
import { getSolanaEcosystem } from './solanaWatcher.js';
import { getEthereumEcosystem } from './ethereumWatcher.js';
import { getMonadEcosystem } from './monadWatcher.js';
import { getBaseEcosystem } from './baseWatcher.js';

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
  BTC: 'l1', ETH: 'l1', SOL: 'l1', SUI: 'l1', XRP: 'rwa', ADAVAX: 'l1',
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
  HYPE: 'defi', OSMO: 'defi', RUNE: 'defi', KNC: 'defi', PERP: 'defi',
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
  FORT: 'infra', GPS: 'infra', NS: 'infra', FIDA: 'infra', G: 'infra'
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
  HYPE: ['Hyperliquid L1'],
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

  const [bybitRes, suiEco, solEco, ethEco, monEco, baseEco, cgMap] = await Promise.all([
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
    })()
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
    ...[...(baseEco.l2Chain ? [baseEco.l2Chain] : []), ...(baseEco.protocols || [])].map(p => ({ ...p, _injectedChain: 'base' }))
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

    let isOnOurChains = false;
    let onChainChains = [];
    if (matchedProtocol) {
      const allowedChains = ['ethereum', 'sui', 'solana', 'monad', 'base'];
      let protChains = (matchedProtocol.chains || [matchedProtocol.primaryChain || '']).map(c => c.toLowerCase());
      
      // Force native tokens to be recognized on their own chains
      if (baseSymbol === 'SUI') protChains.push('sui');
      if (baseSymbol === 'SOL') protChains.push('solana');
      if (baseSymbol === 'ETH' || baseSymbol === 'WETH') protChains.push('ethereum');
      if (baseSymbol === 'MON' || baseSymbol === 'WMON') protChains.push('monad');
      if (baseSymbol === 'AERO' || baseSymbol === 'BRETT' || baseSymbol === 'VIRTUAL' || baseSymbol === 'DEGEN' || baseSymbol === 'WELL') protChains.push('base');
      
      if (matchedProtocol._injectedChain) protChains.push(matchedProtocol._injectedChain);

      isOnOurChains = protChains.some(c => allowedChains.includes(c));
      onChainChains = protChains.filter(c => allowedChains.includes(c));
      
      // Deduplicate
      onChainChains = [...new Set(onChainChains)];

      if (!isOnOurChains) {
        matchedProtocol = null;
      }
    }

    // If still no blockchain assigned, fallback to our curated known token blockchains
    if (onChainChains.length === 0 && KNOWN_TOKEN_BLOCKCHAINS[baseSymbol]) {
      onChainChains = [...KNOWN_TOKEN_BLOCKCHAINS[baseSymbol]];
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
      hasProtocolRevenue: Boolean(matchedProtocol && (matchedProtocol.revenue7d > 0 || matchedProtocol.revenue24h > 0)),
      protocolName: matchedProtocol?.name || null,
      protocolSlug: matchedProtocol?.slug || null,
      protocolRevenue7d: matchedProtocol?.revenue7d ? Math.round(matchedProtocol.revenue7d) : 0,
      protocolRevenue24h: matchedProtocol?.revenue24h ? Math.round(matchedProtocol.revenue24h) : 0,
      protocolTvl: matchedProtocol?.tvl || 0,
      onChainChains: onChainChains.map(c => c.charAt(0).toUpperCase() + c.slice(1)), // Capitalize
      mcap: matchedProtocol?.mcap || cgMap[baseSymbol] || 0,
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
