// Token Radar quantitative valuation model and farming intelligence engine.
// Implied valuation strictly derived from DeFi protocol fundamentals in the snapshot:
//   - Base TVL multiple (base_multiple)
//   - Category revenue & fee profile multiple (category_multipliers)
//   - 7-day momentum and capital inflow multiplier (growth_multiplier)
//   - Multi-chain liquidity network breadth factor (breadth_multiplier)
//   - Lindy maturity & pre-token runway factor (maturity_multiplier)
//
// Implied Valuation = max(1, round(base_tvl * category_mult * growth_mult * breadth_mult * maturity_mult))
// Farm execution plans derived programmatically from protocol category, chains, TVL, and age.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_multipliers: Record<string, number>;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_multipliers: {
    derivatives: 1.35,
    perpetual: 1.35,
    options: 1.30,
    lending: 1.22,
    cdp: 1.20,
    rwa: 1.25,
    restaking: 1.18,
    yield: 1.10,
    dexs: 1.05,
    services: 1.12,
    bridge: 1.00,
    default: 1.00,
  },
  breadth_step: 0.03,
  breadth_cap: 0.15,
};

export const MODEL_VERSION = 'radar-v2-quant';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    breadth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiplier: number;
  growth_multiplier: number;
  breadth_multiplier: number;
  maturity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function resolveCategoryMultiplier(category: string | null, mults: Record<string, number>): number {
  if (!category) return mults.default ?? 1.0;
  const c = category.toLowerCase();
  for (const [k, v] of Object.entries(mults)) {
    if (k !== 'default' && c.includes(k)) return v;
  }
  return mults.default ?? 1.0;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  catMult: number;
  breadthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const catMult = resolveCategoryMultiplier(protocol.category, model.category_multipliers);

  const chainCount = Array.isArray(protocol.chains) ? protocol.chains.length : 1;
  const breadthBonus = Math.min(Math.max(0, chainCount - 1) * model.breadth_step, model.breadth_cap);
  const breadthMult = 1 + breadthBonus;

  const ageForModel = age ?? model.unknown_age_days;
  const maturityClamped = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + (maturityClamped / model.maturity_days) * model.maturity_range;

  const base = protocol.tvl_usd * model.base_multiple;
  const rawValuation = base * catMult * growthMult * breadthMult * maturityMult;
  const implied = Math.max(1, Math.round(rawValuation));

  return { implied, growthPct, growthMult, catMult, breadthMult, maturityMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  // Ensure all watchlist items are included
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  // Pre-token protocols below the watchlist floor, ranked by TVL
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model);
    return { p, ...res };
  });

  // Strict monotonic order by implied value descending, stable tie-break by slug
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      category_multiplier: round4(s.catMult),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      breadth_multiplier: round4(s.breadthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Maintain qualified activity through snapshot close.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains && p.chains.length > 0 ? p.chains[0]! : 'its primary network';
}

function gasEstimateForChain(chain: string): { initial: string; weekly: string } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum') || c.includes('mainnet')) {
    return { initial: '$15 - $25 in ETH gas', weekly: '$10 - $18 weekly gas' };
  }
  if (c.includes('solana')) {
    return { initial: 'under $0.02 in SOL', weekly: 'under $0.01 in SOL' };
  }
  if (c.includes('arbitrum') || c.includes('base') || c.includes('optimism') || c.includes('polygon') || c.includes('blast') || c.includes('avalanche')) {
    return { initial: 'under $0.35 in L2 gas', weekly: 'under $0.20 weekly' };
  }
  return { initial: 'under $2.00 in network gas', weekly: 'under $1.00 weekly' };
}

function capitalTier(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function categoryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Deposit $${capital} in USDC/stable collateral into ${name} on ${chain}, borrow 20% to activate utilization points, and keep loan healthy.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} USDC margin on ${name} (${chain}), execute one low-leverage hedge position, and generate active trading volume.`;
  }
  if (c.includes('restaking') || c.includes('staking')) {
    return `Stake $${capital} of native ETH/LST via ${name} on ${chain} to accrue operator points and hold receipt token.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of dual-sided liquidity to the core USDC pair on ${name} (${chain}) and keep LP position staked.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name} yield-bearing asset on ${chain} and hold to qualify for institutional points.`;
  }
  if (c.includes('bridge')) {
    return `Route $${capital} across ${chain} via ${name} and interact with destination ecosystem contracts to log bridge volume.`;
  }
  return `Deposit $${capital} into ${name}'s verified vault on ${chain} to establish qualified account history.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalTier(p);
  const hold = holdDaysFor(age);
  const gas = gasEstimateForChain(chain);
  const action = categoryAction(p, capital, chain);

  return [
    {
      text: `Isolate funding in a clean, non-custodial wallet dedicated to ${p.name} on ${chain}; avoid direct transfers from centralized exchange addresses to prevent cluster flagging.`,
      cost: `Gas: ${gas.initial}`,
      time: '5 minutes setup',
    },
    {
      text: action,
      cost: `$${capital} allocated principal plus ${gas.initial}`,
      time: '15 minutes initial deployment',
    },
    {
      text: `Conduct recurring weekly protocol interactions (rebalancing, compounding accrued yield, or renewing liquidity) to establish an organic user score across multiple epochs.`,
      cost: gas.weekly,
      time: '5-10 minutes weekly',
    },
    {
      text: `Maintain position without withdrawal for at least ${hold} continuous days to clear snapshot intervals and avoid mercenary capital penalties.`,
      cost: `$${capital} active balance remains committed`,
      time: `${hold} days lockup`,
    },
    {
      text: `Audit official loyalty dashboard, Discord announcements, and verified points multipliers; verify SSL certs and contract addresses to reject phishing attempts.`,
      cost: 'Free (read-only audit)',
      time: '5 minutes periodic check',
    },
    {
      text: `Document wallet address, transaction hashes, and target criteria in an off-chain ledger; execute clean unwind upon official TGE / airdrop claiming snapshot.`,
      cost: 'Gas: standard exit transaction',
      time: '10 minutes execution',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlistSet = new Set(snapshot.watchlist);
  const earlyCount = board.filter((r) => !watchlistSet.has(r.slug)).length;

  const rows: RadarRow[] = board.map((b) => ({
    rank: b.rank,
    slug: b.slug,
    name: b.name,
    category: b.category,
    chains: b.chains,
    tvl_usd: b.tvl_usd,
    change_7d: b.change_7d,
    mcap_usd: b.mcap_usd,
    listed_at: b.listed_at,
    age_days: b.age_days,
    implied_value_usd: b.implied_value_usd,
    category_multiplier: b.model.category_multiplier,
    growth_multiplier: b.model.growth_multiplier,
    breadth_multiplier: b.model.breadth_multiplier,
    maturity_multiplier: b.model.maturity_multiplier,
  }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    rows,
    live,
  };

  return { board, radar };
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

export function parseSnapshot(content: string): Snapshot {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (err) {
    throw new SnapshotError(`malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!doc || typeof doc !== 'object') throw new SnapshotError('snapshot must be a JSON object');
  const d = doc as Record<string, unknown>;
  if (typeof d.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.as_of)) {
    throw new SnapshotError('snapshot as_of must be YYYY-MM-DD');
  }
  if (typeof d.source !== 'string' || d.source.length === 0) {
    throw new SnapshotError('snapshot source must be non-empty');
  }
  if (typeof d.floor_usd !== 'number' || !Number.isFinite(d.floor_usd) || d.floor_usd <= 0) {
    throw new SnapshotError('snapshot floor_usd must be a positive number');
  }
  if (!Array.isArray(d.protocols)) throw new SnapshotError('snapshot protocols must be an array');
  if (!Array.isArray(d.watchlist)) throw new SnapshotError('snapshot watchlist must be an array');

  return {
    as_of: d.as_of,
    source: d.source,
    floor_usd: d.floor_usd,
    protocols: d.protocols as SnapshotProtocol[],
    watchlist: d.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board must have between 100 and 4,000 rows, got ${board.length}`;
  }
  const slugs = new Set<string>();
  const watchlistRemaining = new Set(snapshot.watchlist);

  let prevImplied = Infinity;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}, expected ${i + 1}`;
    if (!r.slug || typeof r.slug !== 'string') return `row ${i} has invalid slug`;
    if (slugs.has(r.slug)) return `row ${i} has duplicate slug "${r.slug}"`;
    slugs.add(r.slug);
    watchlistRemaining.delete(r.slug);

    if (r.implied_value_usd > prevImplied) {
      return `row ${i} implied_value_usd (${r.implied_value_usd}) exceeds previous row (${prevImplied})`;
    }
    prevImplied = r.implied_value_usd;

    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `row ${i} must have 3..12 farm_steps, got ${r.farm_steps?.length}`;
    }
    for (const step of r.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${i} farm_step length ${trimmed.length} out of range (20..600)`;
      }
    }
  }

  if (watchlistRemaining.size > 0) {
    return `board fails to cover ${watchlistRemaining.size} watchlist protocols (e.g. ${[...watchlistRemaining].slice(0, 3).join(', ')})`;
  }

  return null;
}
