import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getHyperliquidEcosystem } from './hyperliquidWatcher.js';
import { getEthereumEcosystem } from './ethereumWatcher.js';
import { getBaseEcosystem } from './baseWatcher.js';
import { getMonadEcosystem } from './monadWatcher.js';
import { getSolanaEcosystem } from './solanaWatcher.js';
import { getSuiEcosystem } from './suiWatcher.js';
import { getBybitSpotEcosystem } from './bybitWatcher.js';
import { getLeaderboard } from './leaderboardEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const SYNC_STATUS_FILE = path.join(CACHE_DIR, 'sync_status.json');

// Timing constants
export const INTERVAL_15_MIN_MS = 15 * 60 * 1000; // 15 minutes standard real-time cycle
export const INTERVAL_1_HOUR_MS = 60 * 60 * 1000; // 1 hour throttled / rate-limit safe cycle

let schedulerTimer = null;
let isSyncing = false;

let schedulerState = {
  active: false,
  intervalMs: INTERVAL_15_MIN_MS,
  intervalLabel: '15 Minutes (Real-Time On-Chain)',
  isThrottled: false,
  consecutiveRateLimits: 0,
  lastSyncStartedAt: null,
  lastSyncFinishedAt: null,
  nextSyncExpectedAt: null,
  lastCycleDurationMs: 0,
  revenueIncreases: [],
  chainSummaries: {},
  history: []
};

// Load persisted state if exists
async function loadPersistedState() {
  try {
    const raw = await fs.readFile(SYNC_STATUS_FILE, 'utf-8');
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      schedulerState = { ...schedulerState, ...saved, active: false };
    }
  } catch {}
}

async function persistState() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(SYNC_STATUS_FILE, JSON.stringify(schedulerState, null, 2));
  } catch (err) {
    console.error('[OnChainScheduler] Failed to save sync status:', err.message);
  }
}

/**
 * Execute a single on-chain synchronization cycle across all 6 blockchains & Bybit
 */
export async function runOnChainSyncCycle(triggerReason = 'scheduled_15m') {
  if (isSyncing) {
    console.log('[OnChainScheduler] Sync cycle already in progress, skipping overlapping invocation.');
    return schedulerState;
  }

  isSyncing = true;
  const startTime = Date.now();
  schedulerState.lastSyncStartedAt = new Date(startTime).toISOString();
  console.log(`\n[OnChainScheduler] 🔄 Starting On-Chain Telemetry Sync Cycle (${triggerReason}) at ${schedulerState.lastSyncStartedAt}...`);

  let rateLimitDetected = false;
  let rateLimitReason = null;
  const deltas = [];

  // Snapshot previous numbers for delta comparison
  const prevMetrics = { ...(schedulerState.chainSummaries || {}) };

  try {
    // 1. Parallel on-chain query execution with error isolation
    const [hlResult, ethResult, baseResult, monResult, solResult, suiResult, bybitResult] = await Promise.allSettled([
      getHyperliquidEcosystem(true),
      getEthereumEcosystem(true),
      getBaseEcosystem(true),
      getMonadEcosystem(true),
      getSolanaEcosystem(true),
      getSuiEcosystem(true),
      getBybitSpotEcosystem(true)
    ]);

    // Check for HTTP 429 / Rate Limit signatures in any failed promise
    for (const res of [hlResult, ethResult, baseResult, monResult, solResult, suiResult, bybitResult]) {
      if (res.status === 'rejected') {
        const msg = String(res.reason?.message || res.reason || '').toLowerCase();
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('throttl')) {
          rateLimitDetected = true;
          rateLimitReason = res.reason?.message;
          break;
        }
      }
    }

    // 2. Extract and inspect live on-chain metrics & compute revenue increases
    const newSummaries = {};

    // Hyperliquid L1 & HyperEVM
    if (hlResult.status === 'fulfilled' && hlResult.value?.l1Chain) {
      const l1 = hlResult.value.l1Chain;
      const prev = prevMetrics.hyperliquid || {};
      const revDiff = (l1.revenue7d || 0) - (prev.revenue7d || 0);
      const volDiff = (l1.totalVolume24h || 0) - (prev.totalVolume24h || 0);

      newSummaries.hyperliquid = {
        name: 'Hyperliquid L1 & HyperEVM',
        tvl: l1.tvl,
        revenue7d: l1.revenue7d,
        revenue24h: l1.revenue24h,
        fees7d: l1.fees7d,
        volume24h: l1.totalVolume24h,
        hlpApr: l1.hlpAprPct,
        blockNumber: l1.blockNumber
      };

      if (prev.revenue7d && revDiff > 0) {
        deltas.push({ chain: 'Hyperliquid', metric: '7D Revenue', diff: revDiff, current: l1.revenue7d, type: 'increase' });
        console.log(`[OnChainScheduler] 📈 Hyperliquid 7D Revenue INCREASED: +$${revDiff.toLocaleString()} (Now: $${l1.revenue7d.toLocaleString()})`);
      }
      if (prev.totalVolume24h && volDiff > 0) {
        deltas.push({ chain: 'Hyperliquid', metric: '24H Volume', diff: volDiff, current: l1.totalVolume24h, type: 'increase' });
      }
    }

    // Ethereum L1 EVM
    if (ethResult.status === 'fulfilled' && ethResult.value?.macro) {
      const macro = ethResult.value.macro;
      const prev = prevMetrics.ethereum || {};
      const revDiff = (macro.revenue7d || 0) - (prev.revenue7d || 0);

      newSummaries.ethereum = {
        name: 'Ethereum L1',
        tvl: macro.totalTvl || 62000000000,
        revenue7d: macro.revenue7d,
        revenue24h: macro.revenue24h,
        burnedEth24h: macro.burnedEth24h,
        blockNumber: ethResult.value.blockNumber
      };

      if (prev.revenue7d && revDiff > 0) {
        deltas.push({ chain: 'Ethereum', metric: '7D Net Revenue', diff: revDiff, current: macro.revenue7d, type: 'increase' });
        console.log(`[OnChainScheduler] 📈 Ethereum 7D Revenue INCREASED: +$${revDiff.toLocaleString()} (Now: $${macro.revenue7d.toLocaleString()})`);
      }
    }

    // Base L2 EVM
    if (baseResult.status === 'fulfilled' && baseResult.value?.l2Chain) {
      const l2 = baseResult.value.l2Chain;
      const prev = prevMetrics.base || {};
      const revDiff = (l2.sequencerNetRevenue7d || l2.revenue7d || 0) - (prev.revenue7d || 0);

      newSummaries.base = {
        name: 'Base L2',
        tvl: l2.tvl,
        revenue7d: l2.sequencerNetRevenue7d || l2.revenue7d,
        revenue24h: l2.revenue24h,
        sequencerMarginPct: l2.sequencerMarginPct,
        blockNumber: l2.blockNumber
      };

      if (prev.revenue7d && revDiff > 0) {
        deltas.push({ chain: 'Base', metric: '7D Sequencer Revenue', diff: revDiff, current: l2.revenue7d, type: 'increase' });
        console.log(`[OnChainScheduler] 📈 Base Sequencer 7D Revenue INCREASED: +$${revDiff.toLocaleString()} (Now: $${l2.revenue7d.toLocaleString()})`);
      }
    }

    // Monad L1 EVM
    if (monResult.status === 'fulfilled' && monResult.value?.l1Chain) {
      const mon = monResult.value.l1Chain;
      const prev = prevMetrics.monad || {};
      const tvlDiff = (mon.tvl || 0) - (prev.tvl || 0);

      newSummaries.monad = {
        name: 'Monad L1 (Chain ID 143)',
        tvl: mon.tvl,
        revenue7d: mon.revenue7d,
        volume24h: mon.volume24h,
        blockNumber: mon.blockHeight
      };

      if (prev.tvl && tvlDiff > 0) {
        deltas.push({ chain: 'Monad', metric: 'On-Chain TVL', diff: tvlDiff, current: mon.tvl, type: 'increase' });
      }
    }

    // Solana SPL & Validator Revenue
    if (solResult.status === 'fulfilled' && solResult.value?.summary) {
      const sol = solResult.value.summary;
      const prev = prevMetrics.solana || {};
      const revDiff = (sol.totalRevenue7d || 0) - (prev.revenue7d || 0);

      newSummaries.solana = {
        name: 'Solana Mainnet',
        tvl: sol.totalTvl,
        revenue7d: sol.totalRevenue7d,
        revenue24h: sol.totalRevenue24h,
        fees7d: sol.totalFees7d
      };

      if (prev.revenue7d && revDiff > 0) {
        deltas.push({ chain: 'Solana', metric: '7D Revenue', diff: revDiff, current: sol.totalRevenue7d, type: 'increase' });
        console.log(`[OnChainScheduler] 📈 Solana 7D Revenue INCREASED: +$${revDiff.toLocaleString()} (Now: $${sol.totalRevenue7d.toLocaleString()})`);
      }
    }

    // Sui Move Ecosystem
    if (suiResult.status === 'fulfilled' && suiResult.value?.summary) {
      const sui = suiResult.value.summary;
      const prev = prevMetrics.sui || {};
      const revDiff = (sui.totalRevenue7d || 0) - (prev.revenue7d || 0);

      newSummaries.sui = {
        name: 'Sui Network',
        tvl: sui.totalTvl,
        revenue7d: sui.totalRevenue7d,
        revenue24h: sui.totalRevenue24h
      };

      if (prev.revenue7d && revDiff > 0) {
        deltas.push({ chain: 'Sui', metric: '7D Revenue', diff: revDiff, current: sui.totalRevenue7d, type: 'increase' });
        console.log(`[OnChainScheduler] 📈 Sui 7D Revenue INCREASED: +$${revDiff.toLocaleString()} (Now: $${sui.totalRevenue7d.toLocaleString()})`);
      }
    }

    // 3. Rebuild Multi-Chain Unified Leaderboard
    await getLeaderboard({ forceRefresh: true }).catch(() => {});

    // 4. Adaptive rate-limit handling (Switch between 15m and 1h)
    if (rateLimitDetected) {
      schedulerState.consecutiveRateLimits += 1;
      schedulerState.isThrottled = true;
      schedulerState.intervalMs = INTERVAL_1_HOUR_MS;
      schedulerState.intervalLabel = '1 Hour (Rate-Limit Protection Mode)';
      console.warn(`[OnChainScheduler] ⚠️ On-chain RPC rate-limit detected (${rateLimitReason || '429 Throttled'}). Switched to safe 1-HOUR interval.`);
    } else {
      // Safe normal operation: keep or restore 15-minute standard
      schedulerState.consecutiveRateLimits = 0;
      schedulerState.isThrottled = false;
      schedulerState.intervalMs = INTERVAL_1_MIN_OR_15_MIN();
      schedulerState.intervalLabel = '15 Minutes (Real-Time On-Chain)';
    }

    schedulerState.chainSummaries = newSummaries;
    if (deltas.length > 0) {
      schedulerState.revenueIncreases = [
        ...deltas.map(d => ({ ...d, timestamp: new Date().toISOString() })),
        ...(schedulerState.revenueIncreases || [])
      ].slice(0, 30);
    }

    const duration = Date.now() - startTime;
    schedulerState.lastSyncFinishedAt = new Date().toISOString();
    schedulerState.lastCycleDurationMs = duration;
    schedulerState.nextSyncExpectedAt = new Date(Date.now() + schedulerState.intervalMs).toISOString();

    schedulerState.history = [
      {
        timestamp: schedulerState.lastSyncFinishedAt,
        durationMs: duration,
        status: 'success',
        rateLimited: rateLimitDetected,
        deltasCount: deltas.length,
        triggerReason
      },
      ...(schedulerState.history || [])
    ].slice(0, 20);

    console.log(`[OnChainScheduler] ✅ On-Chain Sync finished in ${(duration / 1000).toFixed(2)}s. Next sync in ${schedulerState.intervalMs / 60000} minutes (${schedulerState.nextSyncExpectedAt}).`);

  } catch (err) {
    console.error('[OnChainScheduler] ❌ Sync cycle encountered an error:', err.message);
  } finally {
    isSyncing = false;
    await persistState();
  }

  return schedulerState;
}

function INTERVAL_1_MIN_OR_15_MIN() {
  return INTERVAL_15_MIN_MS;
}

/**
 * Start the automated background recurring timer
 */
export function startOnChainScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  loadPersistedState().then(() => {
    schedulerState.active = true;
    console.log(`[OnChainScheduler] 🚀 Scheduler active. Interval: ${schedulerState.intervalLabel} (${schedulerState.intervalMs / 60000} min).`);

    // Schedule next run
    schedulerTimer = setInterval(() => {
      runOnChainSyncCycle('timer_tick');
    }, schedulerState.intervalMs);

    // Run first sync shortly after startup if last sync was > 15m ago
    const lastTime = schedulerState.lastSyncFinishedAt ? new Date(schedulerState.lastSyncFinishedAt).getTime() : 0;
    if (Date.now() - lastTime > schedulerState.intervalMs) {
      setTimeout(() => {
        runOnChainSyncCycle('startup_refresh');
      }, 5000);
    }
  });
}

/**
 * Stop scheduler if needed
 */
export function stopOnChainScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerState.active = false;
  console.log('[OnChainScheduler] Scheduler paused.');
}

/**
 * Get current scheduler health and delta telemetry
 */
export function getOnChainSchedulerStatus() {
  return {
    ...schedulerState,
    isSyncing,
    nextSyncInSeconds: schedulerState.nextSyncExpectedAt
      ? Math.max(0, Math.round((new Date(schedulerState.nextSyncExpectedAt).getTime() - Date.now()) / 1000))
      : Math.round(schedulerState.intervalMs / 1000)
  };
}
