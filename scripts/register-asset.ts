/**
 * Register an asset in Ghostfolio with the right data source:
 *   1. Probe hybrid-data-svc for coverage via GET /v1/profile/{tvSymbol}.
 *   2. If 404 and --add-on-miss (default true), POST /v1/assets and re-probe up to 60s.
 *   3. If hybrid covers → create a MANUAL SymbolProfile with scraperConfiguration + symbolMapping pointing at hybrid.
 *   4. Otherwise fall back to YAHOO (equity) or COINGECKO (crypto via --coingecko-id).
 *   5. Trigger an initial gather so the dashboard reflects the live price.
 *
 * Symbol convention (see /Users/sander/.claude/projects/-Users-sander-projects-ghostfolio/memory/ghostfolio-manual-gf-prefix.md):
 *   GF_<EXCHANGE>_<TICKER>  →  hybrid TV symbol <EXCHANGE>:<TICKER>
 *   e.g. GF_BINANCE_BTCUSDT → BINANCE:BTCUSDT
 *
 * Usage (single):
 *   GHOSTFOLIO_ACCESS_TOKEN=<token> npx tsx scripts/register-asset.ts \
 *     --symbol GF_BINANCE_BTCUSDT \
 *     --name "Bitcoin / Tether USD" \
 *     --asset-class CRYPTO
 *
 * Usage (batch):
 *   GHOSTFOLIO_ACCESS_TOKEN=<token> npx tsx scripts/register-asset.ts \
 *     --batch scripts/assets-to-register.example.json
 *
 * Env overrides:
 *   GHOSTFOLIO_API_URL       (default http://localhost:3333)
 *   HYBRID_URL               (default http://localhost:8003)               — used FROM HOST for probing
 *   HYBRID_INTERNAL_URL      (default http://host.docker.internal:8003)    — written into scraperConfiguration (called from inside ghostfolio container)
 *   HYBRID_BEARER            (optional, used for both probe and POST)
 */

import {
  deriveTvSymbol,
  deriveYahooSymbol,
  ghostfolioAssetClass,
  ghostfolioAssetSubClass,
  validateSpec,
  type HybridAssetClass
} from './lib/symbol-derivation.ts';

interface AssetSpec {
  /** Ghostfolio-facing symbol, must start with `GF_`. Pattern: GF_<EXCHANGE>_<TICKER>. */
  symbol: string;
  /** Display name for the profile. */
  name: string;
  /** High-level class used to drive defaults and fallback. */
  assetClass: HybridAssetClass;
  /** Optional override for the TradingView symbol (defaults to the derived <EXCHANGE>:<TICKER>). */
  tvSymbol?: string;
  /** Yahoo symbol to use as fallback when hybrid doesn't cover (e.g. PETR4.SA). */
  yahooSymbol?: string;
  /** CoinGecko id to use as fallback for crypto when hybrid doesn't cover (e.g. "bitcoin"). */
  coingeckoId?: string;
  /** Currency of the asset. Defaults to USD. */
  currency?: string;
  /** Optional ISIN, mainly for equities. */
  isin?: string;
  /** Optional ISO 3166 country, mainly for equities. */
  country?: string;
}

const GHOSTFOLIO_URL = (process.env.GHOSTFOLIO_API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const HYBRID_URL = (process.env.HYBRID_URL ?? 'http://localhost:8003').replace(/\/$/, '');
const HYBRID_INTERNAL_URL = (process.env.HYBRID_INTERNAL_URL ?? 'http://host.docker.internal:8003').replace(/\/$/, '');
const HYBRID_BEARER = process.env.HYBRID_BEARER;
const ACCESS_TOKEN = process.env.GHOSTFOLIO_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('ERROR: GHOSTFOLIO_ACCESS_TOKEN is required.');
  process.exit(1);
}

// ───────────────────────── arg parsing ─────────────────────────

function parseArgs(argv: string[]): { batch?: string; single?: Partial<AssetSpec>; addOnMiss: boolean } {
  const out: { batch?: string; single: Partial<AssetSpec>; addOnMiss: boolean } = {
    single: {},
    addOnMiss: true
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--batch':           out.batch = next; i++; break;
      case '--symbol':          out.single.symbol = next; i++; break;
      case '--name':            out.single.name = next; i++; break;
      case '--asset-class':     out.single.assetClass = next as HybridAssetClass; i++; break;
      case '--tv-symbol':       out.single.tvSymbol = next; i++; break;
      case '--yahoo-symbol':    out.single.yahooSymbol = next; i++; break;
      case '--coingecko-id':    out.single.coingeckoId = next; i++; break;
      case '--currency':        out.single.currency = next; i++; break;
      case '--isin':            out.single.isin = next; i++; break;
      case '--country':         out.single.country = next; i++; break;
      case '--no-add-on-miss':  out.addOnMiss = false; break;
      case '--add-on-miss':     out.addOnMiss = next !== 'false'; if (next === 'true' || next === 'false') i++; break;
    }
  }
  return { batch: out.batch, single: out.single, addOnMiss: out.addOnMiss };
}

const { batch, single, addOnMiss } = parseArgs(process.argv);

// Validation lives in ./lib/symbol-derivation.ts (validateSpec) so it shares the
// VALID_ASSET_CLASSES allow-list with the HybridAssetClass type and is unit-tested.
async function loadSpecs(): Promise<AssetSpec[]> {
  if (batch) {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(batch, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`Batch file ${batch} must contain a JSON array of asset specs.`);
    }
    parsed.forEach((spec, i) => validateSpec(spec, `${batch}[${i}]`));
    return parsed as AssetSpec[];
  }
  if (!single.symbol || !single.name || !single.assetClass) {
    console.error('ERROR: --symbol, --name and --asset-class are required (or use --batch).');
    process.exit(1);
  }
  validateSpec(single, 'CLI args');
  return [single];
}

// Symbol derivation helpers live in ./lib/symbol-derivation.ts so they can be
// unit-tested without the CLI scaffolding. Imported at the top of this file.

// ───────────────────────── hybrid API ─────────────────────────

function hybridHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HYBRID_BEARER) h.Authorization = `Bearer ${HYBRID_BEARER}`;
  return h;
}

async function hybridProbe(tvSymbol: string): Promise<boolean> {
  const res = await fetch(`${HYBRID_URL}/v1/profile/${encodeURIComponent(tvSymbol)}`, {
    headers: hybridHeaders()
  });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  console.error(`  ⚠ hybrid probe returned ${res.status} for ${tvSymbol}: ${await res.text()}`);
  return false;
}

async function hybridAdd(spec: AssetSpec, tvSymbol: string): Promise<boolean> {
  const [exchange, ticker] = tvSymbol.split(':');
  const body = {
    symbol: tvSymbol,
    storage_symbol: ticker,
    name: spec.name,
    exchange,
    currency: spec.currency ?? 'USD',
    asset_class: spec.assetClass,
    asset_subclass: spec.assetClass === 'CRYPTO' ? 'SPOT' : 'STOCK',
    isin: spec.isin,
    country: spec.country,
    timeframes: ['1h', '1D']
  };
  const res = await fetch(`${HYBRID_URL}/v1/assets`, {
    method: 'POST',
    headers: hybridHeaders(),
    body: JSON.stringify(body)
  });
  if (res.status === 201 || res.status === 409) {
    // Poll /v1/profile up to 60s for the entry to flip from pending → reachable
    for (let i = 0; i < 30; i++) {
      if (await hybridProbe(tvSymbol)) return true;
      await sleep(2_000);
    }
    return false;
  }
  console.error(`  ✗ hybrid POST /v1/assets returned ${res.status}: ${await res.text()}`);
  return false;
}

// ───────────────────────── ghostfolio API ─────────────────────────

async function login(): Promise<string> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: ACCESS_TOKEN })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const { authToken } = (await res.json()) as { authToken: string };
  return authToken;
}

function gfAuth(jwt: string): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

async function ensureProfile(jwt: string, dataSource: 'MANUAL' | 'YAHOO' | 'COINGECKO', symbol: string): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/profile-data/${dataSource}/${encodeURIComponent(symbol)}`, {
    method: 'POST',
    headers: gfAuth(jwt)
  });
  if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
    throw new Error(`Create profile ${dataSource}/${symbol} failed: ${res.status} ${await res.text()}`);
  }
}

async function patchProfile(
  jwt: string,
  dataSource: 'MANUAL' | 'YAHOO' | 'COINGECKO',
  symbol: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/profile-data/${dataSource}/${encodeURIComponent(symbol)}`, {
    method: 'PATCH',
    headers: gfAuth(jwt),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Patch profile ${dataSource}/${symbol} failed: ${res.status} ${await res.text()}`);
}

async function triggerGather(jwt: string, dataSource: string, symbol: string): Promise<void> {
  // ?range=1d avoids the RangeError crash documented in the integration memory.
  const res = await fetch(
    `${GHOSTFOLIO_URL}/api/v1/admin/gather/${dataSource}/${encodeURIComponent(symbol)}?range=1d`,
    { method: 'POST', headers: gfAuth(jwt) }
  );
  if (!res.ok) {
    throw new Error(`gather ${dataSource}/${symbol}: ${res.status} ${await res.text()}`);
  }
}

// ───────────────────────── workflow ─────────────────────────

async function processOne(jwt: string, spec: AssetSpec): Promise<'hybrid' | 'fallback' | 'uncovered'> {
  const tvSymbol = spec.tvSymbol ?? deriveTvSymbol(spec.symbol);
  let covered = await hybridProbe(tvSymbol);

  if (!covered && addOnMiss) {
    console.log(`  → ${spec.symbol}: hybrid 404, attempting POST /v1/assets for ${tvSymbol}…`);
    covered = await hybridAdd(spec, tvSymbol);
  }

  if (covered) {
    const yahooMapping = deriveYahooSymbol(spec);
    await ensureProfile(jwt, 'MANUAL', spec.symbol);
    await patchProfile(jwt, 'MANUAL', spec.symbol, {
      name: spec.name,
      currency: spec.currency ?? 'USD',
      assetClass: ghostfolioAssetClass(spec),
      assetSubClass: ghostfolioAssetSubClass(spec),
      symbolMapping: {
        HYBRID: tvSymbol,
        ...(yahooMapping ? { YAHOO: yahooMapping } : {}),
        ...(spec.coingeckoId ? { COINGECKO: spec.coingeckoId } : {})
      },
      scraperConfiguration: {
        url: `${HYBRID_INTERNAL_URL}/v1/quote/${encodeURIComponent(tvSymbol)}`,
        selector: '$.price',
        mode: 'instant',
        ...(HYBRID_BEARER ? { headers: { Authorization: `Bearer ${HYBRID_BEARER}` } } : {})
      }
    });
    await triggerGather(jwt, 'MANUAL', spec.symbol);
    return 'hybrid';
  }

  // Fallback: Yahoo for equity/ETF, CoinGecko for crypto.
  const yahoo = deriveYahooSymbol(spec);
  if (yahoo) {
    await ensureProfile(jwt, 'YAHOO', yahoo);
    await triggerGather(jwt, 'YAHOO', yahoo);
    console.log(`  ⚠ ${spec.symbol}: hybrid uncovered; created YAHOO/${yahoo} (different symbol than GF_*).`);
    return 'fallback';
  }
  if (spec.assetClass === 'CRYPTO' && spec.coingeckoId) {
    await ensureProfile(jwt, 'COINGECKO', spec.coingeckoId);
    await triggerGather(jwt, 'COINGECKO', spec.coingeckoId);
    console.log(`  ⚠ ${spec.symbol}: hybrid uncovered; created COINGECKO/${spec.coingeckoId}.`);
    return 'fallback';
  }
  console.error(`  ✗ ${spec.symbol}: hybrid uncovered and no fallback (provide --yahoo-symbol or --coingecko-id).`);
  return 'uncovered';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const specs = await loadSpecs();
  console.log(`Logging in to ${GHOSTFOLIO_URL}…`);
  const jwt = await login();
  console.log(`Probing hybrid at ${HYBRID_URL} (Ghostfolio scraper will use ${HYBRID_INTERNAL_URL}).\n`);

  const tallies = { hybrid: 0, fallback: 0, uncovered: 0 };
  for (const spec of specs) {
    console.log(`Processing ${spec.symbol} (${spec.assetClass}: ${spec.name})…`);
    try {
      const outcome = await processOne(jwt, spec);
      tallies[outcome]++;
      const mark = outcome === 'hybrid' ? '✓' : outcome === 'fallback' ? '⚠' : '✗';
      console.log(`  ${mark} ${spec.symbol}: ${outcome}\n`);
    } catch (err) {
      tallies.uncovered++;
      console.error(`  ✗ ${spec.symbol}: ${(err as Error).message}\n`);
    }
  }

  console.log('Summary:');
  console.log(`  ✓ via hybrid:   ${tallies.hybrid}`);
  console.log(`  ⚠ via fallback: ${tallies.fallback}`);
  console.log(`  ✗ uncovered:    ${tallies.uncovered}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
