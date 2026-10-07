/**
 * Web3 Mathematical & Financial Analytics Engine
 * Provides deterministic mathematical models for cash flows, run-rates,
 * valuation ratios, whale concentration indices, and treasury buyback execution.
 */

/**
 * Calculates Annualized Run-Rate (ARR) based on timeframe
 * @param {number} revenue - Cash flow in USD
 * @param {string} timeframe - '24h' | '7d' | '30d'
 * @returns {number}
 */
export function calculateAnnualizedRunRate(revenue, timeframe = '7d') {
  if (!revenue || revenue <= 0) return 0;
  switch (timeframe.toLowerCase()) {
    case '24h':
      return revenue * 365.25;
    case '7d':
      return revenue * 52.14;
    case '30d':
      return revenue * 12.17;
    default:
      return revenue * 52.14;
  }
}

/**
 * Calculates Price-to-Earnings / Price-to-Sales multiple
 * @param {number} mcap - Market capitalization in USD
 * @param {number} arr - Annualized Run-Rate in USD
 * @returns {number|null}
 */
export function calculatePERatio(mcap, arr) {
  if (!mcap || mcap <= 0 || !arr || arr <= 0) return null;
  return Math.round((mcap / arr) * 10) / 10;
}

/**
 * Calculates cash flow yields on market cap
 * @param {number} revenue - Protocol revenue for period
 * @param {number} mcap - Market cap in USD
 * @param {string} timeframe - '24h' | '7d' | '30d'
 * @returns {{ periodYield: number, apy: number }}
 */
export function calculateYield(revenue, mcap, timeframe = '7d') {
  if (!revenue || revenue <= 0 || !mcap || mcap <= 0) {
    return { periodYield: 0, apy: 0 };
  }
  const periodYield = (revenue / mcap) * 100;
  let multiplier = 52.14;
  if (timeframe === '24h') multiplier = 365.25;
  if (timeframe === '30d') multiplier = 12.17;

  const apy = periodYield * multiplier;
  return {
    periodYield: Math.round(periodYield * 100) / 100,
    apy: Math.round(apy * 10) / 10
  };
}

/**
 * Calculates momentum growth / drop rate delta
 * @param {number} current - Current period metric
 * @param {number} previous - Previous period metric
 * @returns {number} Percentage change
 */
export function calculateMomentumDelta(current, previous) {
  if (!previous || previous <= 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Calculates fee and revenue split percentages
 * @param {number} grossFees - Total fees paid by users
 * @param {number} protocolRev - Net fees captured by treasury/stakers
 * @param {{ lpPct: number, protocolPct: number }} defaultSplit - Fallback model
 * @returns {{ lpShare: number, lpPct: number, revPct: number }}
 */
export function calculateRevenueSplit(grossFees, protocolRev, defaultSplit = { lpPct: 75, protocolPct: 25 }) {
  if (grossFees > 0) {
    const lpShare = Math.max(0, grossFees - protocolRev);
    const lpPct = Math.round((lpShare / grossFees) * 1000) / 10;
    const revPct = Math.round((protocolRev / grossFees) * 1000) / 10;
    return { lpShare, lpPct, revPct };
  }
  return {
    lpShare: 0,
    lpPct: defaultSplit.lpPct,
    revPct: defaultSplit.protocolPct
  };
}

/**
 * Evaluates token holder concentration and whale risk vector
 * @param {number} top10Pct - Percentage of supply held by top 10 wallets
 * @param {number} top20Pct - Percentage of supply held by top 20 wallets
 * @returns {{ riskLevel: string, riskScore: number, decentralizationScore: number, description: string }}
 */
export function calculateWhaleRisk(top10Pct, top20Pct = null) {
  const t10 = typeof top10Pct === 'number' ? top10Pct : 50;
  
  // Decentralization score on a scale of 0 to 100
  // C10 = 0% -> Decent = 100; C10 = 100% -> Decent = 0
  const decentralizationScore = Math.max(0, Math.min(100, Math.round(100 - t10)));
  
  let riskLevel = 'MODERATE_RISK';
  let riskScore = 50;
  let description = 'Balanced distribution between institutional entities and community retail holders.';

  if (t10 < 35) {
    riskLevel = 'LOW_RISK';
    riskScore = Math.round(t10);
    description = 'Highly decentralized token distribution. Low vulnerability to systemic whale sell-offs.';
  } else if (t10 > 60) {
    riskLevel = 'HIGH_RISK';
    riskScore = Math.round(t10);
    description = 'High whale concentration. Top 10 wallets control significant market supply; elevated price manipulation risk.';
  } else {
    riskScore = Math.round(t10);
  }

  return {
    riskLevel,
    riskScore,
    decentralizationScore,
    description
  };
}

/**
 * Calculates annualized token burn velocity (% per year)
 * @param {number} burnedTokens - Tokens burned during period
 * @param {number} totalSupply - Base total supply
 * @param {number} periodDays - Duration of observation in days
 * @returns {number} Annualized % contraction
 */
export function calculateBurnVelocity(burnedTokens, totalSupply, periodDays = 365) {
  if (!burnedTokens || burnedTokens <= 0 || !totalSupply || totalSupply <= 0) return 0;
  const periodBurnRatio = burnedTokens / totalSupply;
  const annualized = periodBurnRatio * (365 / periodDays) * 100;
  return Math.round(annualized * 100) / 100;
}

/**
 * Calculates buyback execution efficiency
 * @param {number} realizedBuybackUSD - Actual on-chain repurchase USD value
 * @param {number} theoreticalAllocationUSD - Target revenue allocation for buyback
 * @returns {number}
 */
export function calculateBuybackEfficiency(realizedBuybackUSD, theoreticalAllocationUSD) {
  if (!theoreticalAllocationUSD || theoreticalAllocationUSD <= 0) return 100;
  const ratio = (realizedBuybackUSD / theoreticalAllocationUSD) * 100;
  return Math.min(150, Math.round(ratio * 10) / 10);
}

/**
 * Calculates Price-to-Fees (P/F) multiple based on gross annualized fees
 * @param {number} mcap - Market capitalization in USD
 * @param {number} annualizedFees - Annualized gross fees in USD
 * @returns {number|null}
 */
export function calculatePriceToFeesRatio(mcap, annualizedFees) {
  if (!mcap || mcap <= 0 || !annualizedFees || annualizedFees <= 0) return null;
  return Math.round((mcap / annualizedFees) * 10) / 10;
}

/**
 * Calculates Solana L1 Real Economic Value (REV) vector (SIMD-0096 + Jito MEV)
 * REV = 0.50*F_base (Burn) + 0.50*F_base (Leader) + 1.00*F_priority (Leader) + T_Jito (MEV Tips)
 * @param {number} totalL1ChainFeesUsd - L1 base + priority fees from chain telemetry
 * @param {number} l1BurnedRevenueUsd - Verified 50% base fee burn reported on-chain
 * @param {number} jitoMevTipsUsd - Jito Block Engine bundle tips in USD
 * @returns {object} Mathematical REV decomposition
 */
export function calculateSolanaREV(totalL1ChainFeesUsd, l1BurnedRevenueUsd, jitoMevTipsUsd) {
  const safeChainFees = Math.max(0, totalL1ChainFeesUsd || 0);
  // Base fee burn is 50% of base fees; therefore total base fees = 2 * burned
  const baseFeeBurnUsd = Math.max(0, l1BurnedRevenueUsd || safeChainFees * 0.115);
  const baseFeeValidatorUsd = baseFeeBurnUsd;
  const totalBaseFeesUsd = baseFeeBurnUsd + baseFeeValidatorUsd;
  const priorityFeesValidatorUsd = Math.max(0, safeChainFees - totalBaseFeesUsd);

  const safeJitoTips = Math.max(0, jitoMevTipsUsd || 0);
  const jitoDaoCutUsd = safeJitoTips * 0.057; // ~5.7% Jito DAO / Tip Router cut
  const jitoValidatorAndLstUsd = Math.max(0, safeJitoTips - jitoDaoCutUsd);

  const totalRevUsd = totalBaseFeesUsd + priorityFeesValidatorUsd + safeJitoTips;
  const denom = totalRevUsd > 0 ? totalRevUsd : 1;

  return {
    totalRevUsd: Math.round(totalRevUsd),
    baseFeeBurnUsd: Math.round(baseFeeBurnUsd),
    baseFeeValidatorUsd: Math.round(baseFeeValidatorUsd),
    priorityFeesValidatorUsd: Math.round(priorityFeesValidatorUsd),
    jitoMevTipsUsd: Math.round(safeJitoTips),
    jitoValidatorAndLstUsd: Math.round(jitoValidatorAndLstUsd),
    jitoDaoCutUsd: Math.round(jitoDaoCutUsd),
    totalValidatorAndStakerRealYieldUsd: Math.round(baseFeeValidatorUsd + priorityFeesValidatorUsd + jitoValidatorAndLstUsd),
    shares: {
      baseBurnPct: Math.round((baseFeeBurnUsd / denom) * 1000) / 10,
      priorityFeePct: Math.round((priorityFeesValidatorUsd / denom) * 1000) / 10,
      mevTipsPct: Math.round((safeJitoTips / denom) * 1000) / 10,
      baseValidatorPct: Math.round((baseFeeValidatorUsd / denom) * 1000) / 10
    }
  };
}

/**
 * Calculates DePIN Burn-and-Mint Equilibrium (BME) metrics
 * @param {number} burnedUsd - Value of tokens burned for Data Credits / Compute
 * @param {number} emittedUsd - Value of scheduled epoch token emissions
 * @returns {{ bmeRatio: number, netBurnUsd: number, regime: string }}
 */
export function calculateDepinBmeEquilibrium(burnedUsd, emittedUsd) {
  const safeBurn = Math.max(0, burnedUsd || 0);
  const safeMint = Math.max(1, emittedUsd || 1);
  const bmeRatio = Math.round((safeBurn / safeMint) * 100) / 100;
  const netBurnUsd = Math.round(safeBurn - safeMint);
  const regime = bmeRatio >= 1.0 ? 'NET_DEFLATIONARY' : (bmeRatio >= 0.65 ? 'EQUILIBRIUM_ZONE' : 'EXPANSION_PHASE');
  return { bmeRatio, netBurnUsd, regime };
}

/**
 * Calculates Ethereum L1 Real Economic Value (REV) vector (EIP-1559 Burn + Priority Fees + MEV-Boost + EIP-4844 Blobs)
 * @param {number} totalL1ChainFeesUsd - L1 total execution + blob fees
 * @param {number} l1BurnedRevenueUsd - Verified EIP-1559 base + blob fee burn in USD
 * @param {number} mevBoostTipsUsd - MEV-Boost / Flashbots proposer block rewards in USD
 * @returns {object} Mathematical Ethereum REV decomposition
 */
export function calculateEthereumREV(totalL1ChainFeesUsd, l1BurnedRevenueUsd, mevBoostTipsUsd) {
  const safeChainFees = Math.max(0, totalL1ChainFeesUsd || 0);
  const eip1559BurnUsd = Math.max(0, l1BurnedRevenueUsd || safeChainFees * 0.78);
  const priorityFeesValidatorUsd = Math.max(0, safeChainFees - eip1559BurnUsd);
  const blobFeesUsd = Math.round(eip1559BurnUsd * 0.085); // L2 EIP-4844 Blob DA burn share
  const safeMevTips = Math.max(0, mevBoostTipsUsd || safeChainFees * 0.24);

  const totalRevUsd = eip1559BurnUsd + priorityFeesValidatorUsd + safeMevTips;
  const denom = totalRevUsd > 0 ? totalRevUsd : 1;

  return {
    totalRevUsd: Math.round(totalRevUsd),
    eip1559BurnUsd: Math.round(eip1559BurnUsd),
    priorityFeesValidatorUsd: Math.round(priorityFeesValidatorUsd),
    mevBoostTipsUsd: Math.round(safeMevTips),
    blobFeesUsd: Math.round(blobFeesUsd),
    totalValidatorAndLstRealYieldUsd: Math.round(priorityFeesValidatorUsd + safeMevTips),
    shares: {
      burnPct: Math.round((eip1559BurnUsd / denom) * 1000) / 10,
      priorityPct: Math.round((priorityFeesValidatorUsd / denom) * 1000) / 10,
      mevPct: Math.round((safeMevTips / denom) * 1000) / 10,
      blobPct: Math.round((blobFeesUsd / denom) * 1000) / 10
    }
  };
}

/**
 * Calculates Monad L1 Parallel EVM Real Economic Value (REV) vector
 * (Gas-on-Limit Base Fee Burn + Priority Leader Tips + FastLane MEV Bundles + Carriage Cost Reserve)
 * @param {number} totalL1ChainFeesUsd - L1 total gas_limit execution + carriage fees
 * @param {number} l1BurnedRevenueUsd - Verified on-chain Base Fee MON burn in USD
 * @param {number} fastlaneMevTipsUsd - FastLane MEV auction tips to Validators & LSTs (aprMON/gMON/sMON)
 * @returns {object} Mathematical Monad REV decomposition
 */
export function calculateMonadREV(totalL1ChainFeesUsd, l1BurnedRevenueUsd, fastlaneMevTipsUsd) {
  const safeChainFees = Math.max(0, totalL1ChainFeesUsd || 0);
  const baseFeeBurnUsd = Math.max(0, l1BurnedRevenueUsd || safeChainFees * 0.72);
  const priorityFeesValidatorUsd = Math.max(0, safeChainFees - baseFeeBurnUsd);
  const carriageReserveCostUsd = Math.round(baseFeeBurnUsd * 0.14); // Consensus pre-execution Carriage Cost share
  const safeMevTips = Math.max(0, fastlaneMevTipsUsd || safeChainFees * 0.31);

  const totalRevUsd = baseFeeBurnUsd + priorityFeesValidatorUsd + safeMevTips;
  const denom = totalRevUsd > 0 ? totalRevUsd : 1;

  return {
    totalRevUsd: Math.round(totalRevUsd),
    baseFeeBurnUsd: Math.round(baseFeeBurnUsd),
    priorityFeesValidatorUsd: Math.round(priorityFeesValidatorUsd),
    fastlaneMevTipsUsd: Math.round(safeMevTips),
    carriageReserveCostUsd: Math.round(carriageReserveCostUsd),
    totalValidatorAndLstRealYieldUsd: Math.round(priorityFeesValidatorUsd + safeMevTips),
    shares: {
      burnPct: Math.round((baseFeeBurnUsd / denom) * 1000) / 10,
      priorityPct: Math.round((priorityFeesValidatorUsd / denom) * 1000) / 10,
      mevPct: Math.round((safeMevTips / denom) * 1000) / 10,
      carriagePct: Math.round((carriageReserveCostUsd / denom) * 1000) / 10
    }
  };
}

/**
 * Calculates Base Layer-2 Sequencer Economics (Gross L2 Gas Revenue, L1 Blob Settlement Costs,
 * Net Operating Margin, and Optimism Superchain Revenue Split)
 * @param {number} l2GasFeesUsd - Total user execution fees collected by Base Sequencer in USD
 * @param {number} l1BlobCostUsd - EIP-4844 Blob posting and batch settlement costs paid to Ethereum L1 in USD
 * @returns {object} Base Sequencer economic breakdown
 */
export function calculateBaseSequencerEconomics(l2GasFeesUsd, l1BlobCostUsd = null) {
  const grossRevenue = Math.max(0, l2GasFeesUsd || 0);
  // Post-EIP-4844 Dencun upgrade, L1 blob DA settlement costs average ~4.5% to 8% of gross revenue
  const l1Cost = l1BlobCostUsd !== null ? Math.max(0, l1BlobCostUsd) : Math.round(grossRevenue * 0.058);
  const netOperatingProfit = Math.max(0, grossRevenue - l1Cost);
  const profitMarginPct = grossRevenue > 0 ? Number(((netOperatingProfit / grossRevenue) * 100).toFixed(1)) : 0;
  
  // Base / Optimism Superchain Agreement: 15% of net profit or 2.5% of gross revenue to Optimism Collective
  const opCollectiveShareUsd = Math.round(netOperatingProfit * 0.15);
  const coinbaseRetainedProfitUsd = Math.round(netOperatingProfit - opCollectiveShareUsd);

  return {
    grossRevenueUsd: Math.round(grossRevenue),
    l1BlobCostUsd: Math.round(l1Cost),
    netOperatingProfitUsd: Math.round(netOperatingProfit),
    profitMarginPct,
    opCollectiveShareUsd,
    coinbaseRetainedProfitUsd,
    breakdown: {
      l1SettlementPct: grossRevenue > 0 ? Number(((l1Cost / grossRevenue) * 100).toFixed(1)) : 0,
      superchainCutPct: grossRevenue > 0 ? Number(((opCollectiveShareUsd / grossRevenue) * 100).toFixed(1)) : 0,
      coinbaseMarginPct: grossRevenue > 0 ? Number(((coinbaseRetainedProfitUsd / grossRevenue) * 100).toFixed(1)) : 0
    }
  };
}

