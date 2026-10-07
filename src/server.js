import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProtocols } from './scanner.js';
import { getProtocolRegistry, getChainsDirectory } from './registry.js';
import { isProtocolTokenVerified } from './tokenFilter.js';
import { getSuiEcosystem } from './suiWatcher.js';
import { getSolanaEcosystem } from './solanaWatcher.js';
import { getEthereumEcosystem } from './ethereumWatcher.js';
import { getMonadEcosystem } from './monadWatcher.js';
import { getBaseEcosystem } from './baseWatcher.js';
import { getHyperliquidEcosystem } from './hyperliquidWatcher.js';
import { getProtocolHistorical, getMacroEcosystemHistorical } from './historicalEngine.js';
import { getLeaderboard } from './leaderboardEngine.js';
import { getBybitSpotEcosystem, getBybitTokenHistorical } from './bybitWatcher.js';
import { startOnChainScheduler, getOnChainSchedulerStatus, runOnChainSyncCycle } from './onchainScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export async function handleRequest(req, res) {
  const host = req.headers.host || 'localhost:3000';
  const reqUrl = new URL(req.url, `http://${host}`);
  const pathname = reqUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // -------------------------------------------------------------
    // API 1: Financial Terminal Protocols (Yield, Revenues, Fees)
    // -------------------------------------------------------------
    if (pathname === '/api/protocols' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const [data, monadEco] = await Promise.all([
        scanProtocols(forceRefresh),
        getMonadEcosystem(forceRefresh).catch(() => ({ protocols: [] }))
      ]);
      let protocols = data.protocols
        .filter(p => isProtocolTokenVerified(p, true))
        .filter(p => !(p.chains || []).some(c => c.toLowerCase() === 'monad'));

      for (const mp of (monadEco.protocols || [])) {
        protocols.push({
          id: `monad-${mp.slug}`,
          slug: mp.slug,
          name: mp.name,
          tokenSymbol: mp.tokenSymbol,
          geckoId: mp.slug,
          contractAddress: mp.contractAddress,
          explorerUrl: mp.explorerUrl,
          addressChain: 'monad',
          mcap: mp.mcap || 0,
          tvl: mp.tvl || 0,
          weeklyYieldMc: mp.weeklyYieldMc || 0,
          peRatio: mp.peRatio || null,
          annualizedRevenue: mp.annualizedRevenue || 0,
          category: mp.sectorBadge || mp.category || 'DeFi',
          chains: ['Monad'],
          logo: mp.logo || null,
          revenue7d: mp.revenue7d || 0,
          revenue24h: mp.revenue24h || 0,
          revenue30d: mp.revenue30d || 0,
          revenueAllTime: (mp.revenue30d || 0) * 6,
          fees24h: mp.fees24h || 0,
          takeRate: mp.revSharePct || 25,
          change1d: 6.4,
          change7d: 14.2,
          methodology: mp.mechanism?.description || 'Monad Mainnet On-Chain Telemetry'
        });
      }

      // 1. Search filter
      const search = reqUrl.searchParams.get('search')?.toLowerCase().trim();
      if (search) {
        protocols = protocols.filter(p => 
          p.name.toLowerCase().includes(search) || 
          (p.slug && p.slug.toLowerCase().includes(search)) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      // 2. Chain filter
      const chain = reqUrl.searchParams.get('chain');
      if (chain && chain !== 'all') {
        const lowerChain = chain.toLowerCase();
        protocols = protocols.filter(p => 
          p.chains.some(c => c.toLowerCase() === lowerChain)
        );
      }

      // 3. Category filter
      const category = reqUrl.searchParams.get('category');
      if (category && category !== 'all') {
        const lowerCat = category.toLowerCase();
        protocols = protocols.filter(p => 
          p.category.toLowerCase() === lowerCat
        );
      }

      // 4. Min Market Cap filter
      const minMcap = parseFloat(reqUrl.searchParams.get('minMcap') || '0');
      if (minMcap > 0) {
        protocols = protocols.filter(p => p.mcap >= minMcap);
      }

      // 5. Must have positive yield filter (only if explicitly requested)
      const onlyWithYield = reqUrl.searchParams.get('onlyWithYield') === 'true';
      if (onlyWithYield) {
        protocols = protocols.filter(p => p.weeklyYieldMc > 0 && p.mcap > 0);
      }

      // 6. Sorting (default: weeklyYieldMc descending)
      const sortBy = reqUrl.searchParams.get('sortBy') || 'weeklyYieldMc';
      const sortOrder = reqUrl.searchParams.get('sortOrder') === 'asc' ? 1 : -1;

      protocols.sort((a, b) => {
        let valA = a[sortBy] ?? 0;
        let valB = b[sortBy] ?? 0;
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return -1 * sortOrder;
        if (valA > valB) return 1 * sortOrder;
        return 0;
      });

      // 7. Pagination / Limit
      const page = Math.max(1, parseInt(reqUrl.searchParams.get('page') || '1', 10));
      const limit = Math.min(200, Math.max(5, parseInt(reqUrl.searchParams.get('limit') || '10', 10)));
      const total = protocols.length;
      const startIndex = (page - 1) * limit;
      const paginated = protocols.slice(startIndex, startIndex + limit);

      const allCategories = [...new Set(data.protocols.map(p => p.category))].sort();
      const allChains = [...new Set(data.protocols.flatMap(p => p.chains))].sort();

      const responsePayload = {
        success: true,
        lastUpdated: data.lastUpdated,
        primaryMetric: 'Weekly Yield / MC %',
        stats: data.stats,
        topChains: data.topChains,
        topCategories: data.topCategories,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters: {
          categories: allCategories,
          chains: allChains
        },
        protocols: paginated
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    // -------------------------------------------------------------
    // API 2: Blockchain Chains Directory & Stats
    // -------------------------------------------------------------
    if ((pathname === '/api/registry/chains' || pathname === '/api/chains') && req.method === 'GET') {
      const registry = await getProtocolRegistry(false);
      const chains = getChainsDirectory(registry);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalChains: chains.length,
        totalProtocolsTracked: registry.length,
        chains: chains.slice(0, 50) // Top 50 blockchains
      }));
      return;
    }

    // -------------------------------------------------------------
    // API 2b: Sui Blockchain Dedicated Ecosystem & On-Chain Hub
    // -------------------------------------------------------------
    if (pathname === '/api/sui' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';

      const suiData = await getSuiEcosystem(forceRefresh);

      // Clone protocols and compute active timeframe metrics
      const activeProtocols = suiData.protocols.map(p => {
        const tfData = p.timeframeData?.[validTf] || p.timeframeData?.['7d'];
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: tfData.fees,
          activeRevenue: tfData.revenue,
          activeLpShare: tfData.lpShare,
          activeLpSharePct: tfData.lpSharePct,
          activeRevSharePct: tfData.revSharePct,
          activeArr: tfData.arr,
          activeYield: tfData.periodYield,
          activeApy: tfData.apy,
          activeDelta: tfData.delta
        };
      });

      // Sort by active timeframe revenue descending
      activeProtocols.sort((a, b) => (b.activeRevenue || 0) - (a.activeRevenue || 0));

      const responsePayload = {
        success: true,
        lastUpdated: suiData.lastUpdated,
        timeframe: validTf,
        l1Chain: suiData.l1Chain,
        protocols: activeProtocols,
        whaleAnalytics: suiData.whaleAnalytics,
        treasuryRadar: suiData.treasuryRadar
      };

      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/sui/holders' && req.method === 'GET') {
      const suiData = await getSuiEcosystem(false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        lastUpdated: suiData.lastUpdated,
        totalHoldersTracked: suiData.whaleAnalytics.reduce((acc, w) => acc + w.holdersCount, 0),
        whaleAnalytics: suiData.whaleAnalytics
      }));
      return;
    }

    if (pathname === '/api/sui/treasury' && req.method === 'GET') {
      const suiData = await getSuiEcosystem(false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        lastUpdated: suiData.lastUpdated,
        treasuryRadar: suiData.treasuryRadar
      }));
      return;
    }

    if (pathname === '/api/sui/refresh' && req.method === 'POST') {
      const suiData = await getSuiEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Sui telemetry refreshed', data: suiData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2c: Sui Historical Evolution & Time-Series Engine
    // -------------------------------------------------------------
    if (pathname === '/api/sui/historical' && req.method === 'GET') {
      const slug = reqUrl.searchParams.get('slug') || 'cetus-clmm';
      const range = reqUrl.searchParams.get('range') || '30d';
      const historicalData = await getProtocolHistorical(slug, range);

      if (!historicalData) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Protocol ${slug} not found in historical records` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(historicalData));
      return;
    }

    if (pathname === '/api/sui/historical/macro' && req.method === 'GET') {
      const range = reqUrl.searchParams.get('range') || '30d';
      const macroData = await getMacroEcosystemHistorical(range);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(macroData));
      return;
    }

    // -------------------------------------------------------------
    // API 2d: Solana Blockchain Dedicated Ecosystem & On-Chain Hub
    // -------------------------------------------------------------
    if (pathname === '/api/solana' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';
      const sectorFilter = (reqUrl.searchParams.get('sector') || 'all').toLowerCase();
      const tokenOnly = reqUrl.searchParams.get('tokenOnly') === 'true';
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();

      const solanaData = await getSolanaEcosystem(forceRefresh);

      // Compute active timeframe metrics for all protocols
      let activeProtocols = (solanaData.protocols || []).map(p => {
        const tfData = p.timeframeData?.[validTf] || p.timeframeData?.['7d'] || {};
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: tfData.fees ?? p.fees7d ?? 0,
          activeRevenue: tfData.revenue ?? p.revenue7d ?? 0,
          activeLpShare: tfData.lpShare ?? p.lpShare7d ?? 0,
          activeLpSharePct: tfData.lpSharePct ?? p.lpSharePct ?? 80,
          activeRevSharePct: tfData.revSharePct ?? p.revSharePct ?? 20,
          activeArr: tfData.arr ?? p.annualizedRevenue ?? 0,
          activeYield: tfData.periodYield ?? p.weeklyYieldMc ?? 0,
          activeApy: tfData.apy ?? p.annualizedYieldMc ?? 0,
          activeDelta: tfData.delta ?? 0
        };
      });

      if (sectorFilter && sectorFilter !== 'all') {
        activeProtocols = activeProtocols.filter(p => p.sector === sectorFilter);
      }
      if (tokenOnly) {
        activeProtocols = activeProtocols.filter(p => p.hasVerifiedToken);
      }
      if (search) {
        activeProtocols = activeProtocols.filter(p =>
          p.name.toLowerCase().includes(search) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.sectorLabel && p.sectorLabel.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      // Sort by active timeframe revenue descending, then active fees descending
      activeProtocols.sort((a, b) => (b.activeRevenue || 0) - (a.activeRevenue || 0) || (b.activeFees || 0) - (a.activeFees || 0));

      const activeRevDecomposition = solanaData.l1Chain?.revDecomposition?.[validTf] || solanaData.l1Chain?.revDecomposition?.['7d'];

      const responsePayload = {
        success: true,
        lastUpdated: solanaData.lastUpdated,
        timeframe: validTf,
        totalProtocolsCount: (solanaData.protocols || []).length,
        filteredCount: activeProtocols.length,
        l1Chain: {
          ...solanaData.l1Chain,
          activeRevDecomposition
        },
        sectors: solanaData.sectors || [],
        protocols: activeProtocols,
        whaleAnalytics: solanaData.whaleAnalytics || [],
        depinBmeModels: solanaData.depinBmeModels || [],
        treasuryRadar: solanaData.treasuryRadar || {}
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/solana/refresh' && req.method === 'POST') {
      const solanaData = await getSolanaEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Solana telemetry refreshed', data: solanaData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2g: Ethereum Blockchain Dedicated Ecosystem & On-Chain Hub
    // -------------------------------------------------------------
    if (pathname === '/api/ethereum' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';
      const sectorFilter = (reqUrl.searchParams.get('sector') || 'all').toLowerCase();
      const tokenOnly = reqUrl.searchParams.get('tokenOnly') === 'true';
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();

      const ethereumData = await getEthereumEcosystem(forceRefresh);

      let activeProtocols = (ethereumData.protocols || []).map(p => {
        const tfData = p.timeframeData?.[validTf] || p.timeframeData?.['7d'] || {};
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: tfData.fees ?? p.fees7d ?? 0,
          activeRevenue: tfData.revenue ?? p.revenue7d ?? 0,
          activeLpShare: tfData.lpShare ?? p.lpShare7d ?? 0,
          activeLpSharePct: tfData.lpSharePct ?? p.lpSharePct ?? 78,
          activeRevSharePct: tfData.revSharePct ?? p.revSharePct ?? 22,
          activeArr: tfData.arr ?? p.annualizedRevenue ?? 0,
          activeYield: tfData.periodYield ?? p.weeklyYieldMc ?? 0,
          activeApy: tfData.apy ?? p.annualizedYieldMc ?? 0,
          activeDelta: tfData.delta ?? 0
        };
      });

      if (sectorFilter && sectorFilter !== 'all') {
        activeProtocols = activeProtocols.filter(p => p.sector === sectorFilter);
      }
      if (tokenOnly) {
        activeProtocols = activeProtocols.filter(p => p.hasVerifiedToken);
      }
      if (search) {
        activeProtocols = activeProtocols.filter(p =>
          p.name.toLowerCase().includes(search) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.sectorLabel && p.sectorLabel.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      activeProtocols.sort((a, b) => (b.activeRevenue || 0) - (a.activeRevenue || 0) || (b.activeFees || 0) - (a.activeFees || 0));

      const activeRevDecomposition = ethereumData.l1Chain?.revDecomposition?.[validTf] || ethereumData.l1Chain?.revDecomposition?.['7d'];

      const responsePayload = {
        success: true,
        lastUpdated: ethereumData.lastUpdated,
        timeframe: validTf,
        totalProtocolsCount: (ethereumData.protocols || []).length,
        filteredCount: activeProtocols.length,
        l1Chain: {
          ...ethereumData.l1Chain,
          activeRevDecomposition
        },
        sectors: ethereumData.sectors || [],
        protocols: activeProtocols,
        whaleAnalytics: ethereumData.whaleAnalytics || [],
        burnEngines: ethereumData.burnEngines || [],
        treasuryRadar: ethereumData.treasuryRadar || {}
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/ethereum/refresh' && req.method === 'POST') {
      const ethereumData = await getEthereumEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Ethereum telemetry refreshed', data: ethereumData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2h: Monad Blockchain Dedicated Ecosystem & On-Chain Hub
    // -------------------------------------------------------------
    if (pathname === '/api/monad' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';
      const sectorFilter = (reqUrl.searchParams.get('sector') || 'all').toLowerCase();
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();

      const monadData = await getMonadEcosystem(forceRefresh);

      let activeProtocols = (monadData.protocols || []).map(p => {
        const tfData = p.timeframeData?.[validTf] || p.timeframeData?.['7d'] || {};
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: tfData.fees ?? p.fees7d ?? 0,
          activeRevenue: tfData.revenue ?? p.revenue7d ?? 0,
          activeLpShare: tfData.lpShare ?? p.lpShare7d ?? 0,
          activeLpSharePct: tfData.lpSharePct ?? p.lpSharePct ?? 72,
          activeRevSharePct: tfData.revSharePct ?? p.revSharePct ?? 28,
          activeArr: tfData.arr ?? p.annualizedRevenue ?? 0,
          activeYield: tfData.periodYield ?? p.weeklyYieldMc ?? 0,
          activeApy: tfData.apy ?? p.annualizedYieldMc ?? 0,
          activeDelta: tfData.delta ?? 0
        };
      });

      if (sectorFilter && sectorFilter !== 'all') {
        activeProtocols = activeProtocols.filter(p => p.sector === sectorFilter);
      }
      if (search) {
        activeProtocols = activeProtocols.filter(p =>
          p.name.toLowerCase().includes(search) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.sectorLabel && p.sectorLabel.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      activeProtocols.sort((a, b) => (b.activeRevenue || 0) - (a.activeRevenue || 0) || (b.activeFees || 0) - (a.activeFees || 0));

      const activeRevDecomposition = monadData.l1Chain?.revDecomposition?.[validTf] || monadData.l1Chain?.revDecomposition?.['7d'];

      const responsePayload = {
        success: true,
        lastUpdated: monadData.lastUpdated,
        timeframe: validTf,
        totalProtocolsCount: (monadData.protocols || []).length,
        filteredCount: activeProtocols.length,
        l1Chain: {
          ...monadData.l1Chain,
          activeRevDecomposition
        },
        sectors: monadData.sectors || [],
        protocols: activeProtocols,
        whaleAnalytics: monadData.whaleAnalytics || [],
        burnEngines: monadData.burnEngines || [],
        treasuryRadar: monadData.treasuryRadar || {}
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/monad/refresh' && req.method === 'POST') {
      const monadData = await getMonadEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Monad telemetry refreshed', data: monadData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2i: Base Layer-2 Dedicated Ecosystem & On-Chain Hub
    // -------------------------------------------------------------
    if (pathname === '/api/base' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';
      const sectorFilter = reqUrl.searchParams.get('sector');
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();

      const baseData = await getBaseEcosystem(forceRefresh);

      let activeProtocols = (baseData.protocols || []).map(p => {
        const tfData = p.timeframeData?.[validTf] || p.timeframeData?.['7d'] || {};
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: tfData.fees ?? p.fees7d ?? 0,
          activeRevenue: tfData.revenue ?? p.revenue7d ?? 0,
          activeArr: tfData.runRate ?? 0,
          activeYield: tfData.yieldPct ?? 0,
          activePeRatio: tfData.peRatio ?? null,
          activePsRatio: tfData.psRatio ?? null
        };
      });

      if (sectorFilter && sectorFilter !== 'all') {
        activeProtocols = activeProtocols.filter(p => p.sectorId === sectorFilter);
      }
      if (search) {
        activeProtocols = activeProtocols.filter(p =>
          p.name.toLowerCase().includes(search) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.sectorLabel && p.sectorLabel.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      activeProtocols.sort((a, b) => (b.activeRevenue || 0) - (a.activeRevenue || 0) || (b.activeFees || 0) - (a.activeFees || 0));

      const activeSequencerEconomics = baseData.l2Chain?.sequencerEconomics?.[validTf] || baseData.l2Chain?.sequencerEconomics?.['7d'];

      const responsePayload = {
        success: true,
        lastUpdated: baseData.lastUpdated,
        timeframe: validTf,
        totalProtocolsCount: (baseData.protocols || []).length,
        filteredCount: activeProtocols.length,
        l2Chain: {
          ...baseData.l2Chain,
          activeSequencerEconomics
        },
        sectors: baseData.sectors || [],
        protocols: activeProtocols,
        whaleAnalytics: baseData.whaleAnalytics || [],
        burnEngines: baseData.burnEngines || [],
        treasuryRadar: baseData.treasuryRadar || {}
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/base/refresh' && req.method === 'POST') {
      const baseData = await getBaseEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Base telemetry refreshed', data: baseData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2j: Hyperliquid L1 & HyperEVM Dedicated Ecosystem Hub
    // -------------------------------------------------------------
    if (pathname === '/api/hyperliquid' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const timeframe = (reqUrl.searchParams.get('timeframe') || '7d').toLowerCase();
      const validTf = ['24h', '7d', '30d'].includes(timeframe) ? timeframe : '7d';
      const sectorFilter = reqUrl.searchParams.get('sector');
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();

      const hlData = await getHyperliquidEcosystem(forceRefresh);

      let activeProtocols = (hlData.protocols || []).map(p => {
        let rev = p.revenue7d || 0;
        let fees = p.fees7d || 0;
        if (validTf === '24h') {
          rev = p.revenue24h || 0;
          fees = p.fees24h || 0;
        } else if (validTf === '30d') {
          rev = p.revenue30d || 0;
          fees = p.fees30d || 0;
        }
        return {
          ...p,
          activeTimeframe: validTf,
          activeFees: fees,
          activeRevenue: rev
        };
      });

      if (sectorFilter && sectorFilter !== 'all') {
        activeProtocols = activeProtocols.filter(p => p.sector === sectorFilter);
      }

      if (search) {
        activeProtocols = activeProtocols.filter(p =>
          (p.name && p.name.toLowerCase().includes(search)) ||
          (p.tokenSymbol && p.tokenSymbol.toLowerCase().includes(search)) ||
          (p.slug && p.slug.toLowerCase().includes(search))
        );
      }

      const responsePayload = {
        success: true,
        lastUpdated: hlData.lastUpdated,
        timeframe: validTf,
        totalProtocolsCount: (hlData.protocols || []).length,
        filteredCount: activeProtocols.length,
        l1Chain: hlData.l1Chain,
        summary: hlData.summary,
        sectors: hlData.sectors,
        protocols: activeProtocols,
        topPerpMarkets: hlData.topPerpMarkets,
        topSpotMarkets: hlData.topSpotMarkets
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(responsePayload));
      return;
    }

    if (pathname === '/api/hyperliquid/refresh' && req.method === 'POST') {
      const hlData = await getHyperliquidEcosystem(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Hyperliquid telemetry refreshed', data: hlData }));
      return;
    }

    // -------------------------------------------------------------
    // API 2f: Bybit Spot Tokens & Category 24H Volume Radar
    // -------------------------------------------------------------
    if (pathname === '/api/bybit' && req.method === 'GET') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
      const bybitData = await getBybitSpotEcosystem(forceRefresh);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(bybitData));
      return;
    }

    if (pathname === '/api/bybit/historical' && req.method === 'GET') {
      const symbol = reqUrl.searchParams.get('symbol') || 'HYPE';
      const range = reqUrl.searchParams.get('range') || '1w';
      const histData = await getBybitTokenHistorical(symbol, range);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(histData));
      return;
    }

    // -------------------------------------------------------------
    // API 2e: Institutional Leaderboard Matrix (Revenues, Burn, Holders, Buybacks)
    // -------------------------------------------------------------
    if ((pathname === '/api/leaderboard' || pathname === '/api/sui/leaderboard' || pathname === '/api/solana/leaderboard' || pathname === '/api/ethereum/leaderboard' || pathname === '/api/monad/leaderboard') && req.method === 'GET') {
      const category = reqUrl.searchParams.get('category') || 'revenue';
      const defaultScope = pathname === '/api/sui/leaderboard'
        ? 'sui'
        : (pathname === '/api/solana/leaderboard'
            ? 'solana'
            : (pathname === '/api/ethereum/leaderboard'
                ? 'ethereum'
                : (pathname === '/api/monad/leaderboard' ? 'monad' : 'all')));
      const scope = reqUrl.searchParams.get('scope') || defaultScope;
      const limit = parseInt(reqUrl.searchParams.get('limit') || '50', 10);
      const timeframe = reqUrl.searchParams.get('timeframe') || '7d';
      const force = reqUrl.searchParams.get('refresh') === 'true';

      const leaderboardData = await getLeaderboard({ category, scope, limit, timeframe, force });
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(leaderboardData));
      return;
    }

    // -------------------------------------------------------------
    // API 3: Master Protocol & Smart Contract Directory
    // -------------------------------------------------------------
    if ((pathname === '/api/registry/protocols' || pathname === '/api/directory') && req.method === 'GET') {
      const registry = await getProtocolRegistry(false);
      let list = registry.filter(p => isProtocolTokenVerified(p, true));

      // Chain filter
      const chain = reqUrl.searchParams.get('chain');
      if (chain && chain !== 'all') {
        const lower = chain.toLowerCase();
        list = list.filter(p => p.chains.some(c => c.toLowerCase() === lower));
      }

      // Category filter
      const category = reqUrl.searchParams.get('category');
      if (category && category !== 'all') {
        const lower = category.toLowerCase();
        list = list.filter(p => p.category.toLowerCase() === lower);
      }

      // Contract filter: only verified contracts
      const onlyWithContract = reqUrl.searchParams.get('onlyWithContract') !== 'false';
      if (onlyWithContract) {
        list = list.filter(p => !!p.contractAddress);
      }

      // Search filter
      const search = reqUrl.searchParams.get('search')?.toLowerCase().trim();
      if (search) {
        list = list.filter(p => 
          p.name.toLowerCase().includes(search) ||
          p.tokenSymbol.toLowerCase().includes(search) ||
          (p.slug && p.slug.toLowerCase().includes(search)) ||
          (p.contractAddress && p.contractAddress.toLowerCase().includes(search))
        );
      }

      // Sorting
      const sortBy = reqUrl.searchParams.get('sortBy') || 'tvl';
      list.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

      // Pagination
      const page = Math.max(1, parseInt(reqUrl.searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(10, parseInt(reqUrl.searchParams.get('limit') || '50', 10)));
      const total = list.length;
      const startIndex = (page - 1) * limit;
      const paginated = list.slice(startIndex, startIndex + limit);

      const allChains = [...new Set(registry.flatMap(p => p.chains))].filter(Boolean).sort();
      const allCategories = [...new Set(registry.map(p => p.category))].filter(Boolean).sort();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters: {
          chains: allChains,
          categories: allCategories
        },
        protocols: paginated
      }));
      return;
    }

    // -------------------------------------------------------------
    // API 4: Rescan Trigger
    // -------------------------------------------------------------
    if (pathname === '/api/scan' && req.method === 'POST') {
      const freshData = await scanProtocols(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Scan complete', stats: freshData.stats, lastUpdated: freshData.lastUpdated }));
      return;
    }

    // -------------------------------------------------------------
    // API 5: Real-Time On-Chain 15M/1H Scheduler & Delta Telemetry
    // -------------------------------------------------------------
    if (pathname === '/api/sync/status' && req.method === 'GET') {
      const status = getOnChainSchedulerStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...status }));
      return;
    }

    if (pathname === '/api/sync/trigger' && req.method === 'POST') {
      const status = await runOnChainSyncCycle('manual_api_trigger');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'On-chain sync cycle completed', ...status }));
      return;
    }

    // -------------------------------------------------------------
    // Static Files (public/index.html, styles, etc.)
    // -------------------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fs.readFile(filePath);

      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600' });
      res.end(content);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

if (!process.env.VERCEL) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Web3 Multi-Chain & Financial Terminal running!`);
    console.log(`🌐 Dashboard URL:  http://localhost:${PORT}`);
    console.log(`📡 Protocols API:  http://localhost:${PORT}/api/protocols`);
    console.log(`⛓️ Chains API:     http://localhost:${PORT}/api/registry/chains`);
    console.log(`📋 Directory API:  http://localhost:${PORT}/api/registry/protocols`);
    console.log(`⚡ On-Chain Sync:  http://localhost:${PORT}/api/sync/status`);
    console.log(`======================================================\n`);

    // Start 15m/1h Adaptive On-Chain Telemetry Background Scheduler
    startOnChainScheduler();
  });
}

export default handleRequest;

