/**
 * Seed (or tear down) a realistic test portfolio so the dashboard has enough shape
 * to convince a human that everything works end-to-end.
 *
 * What you get after a seed:
 *   - 7 asset profiles across 4 data sources:
 *       • Hybrid (MANUAL + scraperConfiguration → hybrid-data-svc): BTC, ETH, SOL
 *       • Yahoo (auto):                                              AAPL, MSFT, VOO, PETR4.SA
 *       • MANUAL upload (no scraper):                                BR fund by CNPJ
 *   - 15 activities (BUY, SELL, DIVIDEND) spread Jan–May 2026
 *   - A 5th brokerage account "Inter Invest" (BRL) for the B3 stock and the BR fund
 *   - NAV history bulk-uploaded for the BR fund so its chart isn't flat
 *
 * Usage:
 *   GHOSTFOLIO_ACCESS_TOKEN=<token> npx tsx scripts/seed-test-portfolio.ts
 *   GHOSTFOLIO_ACCESS_TOKEN=<token> npx tsx scripts/seed-test-portfolio.ts --teardown
 */

const GHOSTFOLIO_URL = (process.env.GHOSTFOLIO_API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const HYBRID_INTERNAL_URL = (process.env.HYBRID_INTERNAL_URL ?? 'http://host.docker.internal:8003').replace(/\/$/, '');
const ACCESS_TOKEN = process.env.GHOSTFOLIO_ACCESS_TOKEN;

const TEARDOWN = process.argv.includes('--teardown');

if (!ACCESS_TOKEN) {
  console.error('ERROR: GHOSTFOLIO_ACCESS_TOKEN is required.');
  process.exit(1);
}

// ───────────────────────── data ─────────────────────────

interface HybridProfile {
  symbol: string;       // Ghostfolio symbol (GF_…)
  tvSymbol: string;     // hybrid TradingView id
  name: string;
  currency: string;
}

const HYBRID_PROFILES: HybridProfile[] = [
  { symbol: 'GF_BINANCE_BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', name: 'Bitcoin',  currency: 'USD' },
  { symbol: 'GF_BINANCE_ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', name: 'Ethereum', currency: 'USD' },
  { symbol: 'GF_BINANCE_SOLUSDT', tvSymbol: 'BINANCE:SOLUSDT', name: 'Solana',   currency: 'USD' }
];

const BR_FUND = {
  symbol: 'GF_BR_FUND_12345678000190',
  name: 'Fundo Teste FIA (CNPJ 12.345.678/0001-90)',
  currency: 'BRL',
  navHistory: [
    { date: '2026-01-05', marketPrice: 1.0000 },
    { date: '2026-01-31', marketPrice: 1.0245 },
    { date: '2026-02-28', marketPrice: 1.0512 },
    { date: '2026-03-31', marketPrice: 1.0934 },
    { date: '2026-04-30', marketPrice: 1.1234 },
    { date: '2026-05-29', marketPrice: 1.1812 }
  ]
};

// Yahoo symbols don't need profile pre-creation: connectOrCreate handles them on activity insert.
const YAHOO_SYMBOLS = new Set(['AAPL', 'MSFT', 'VOO', 'PETR4.SA']);

const BR_PLATFORM = { name: 'Inter Invest', url: 'https://www.bancointer.com.br' };
const BR_ACCOUNT  = { name: 'Inter Invest', currency: 'BRL', balance: 0, platformName: 'Inter Invest' };

interface Activity {
  symbol: string;
  dataSource: 'MANUAL' | 'YAHOO';
  account: string; // account name to resolve to id
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  quantity: number;
  unitPrice: number;
  fee: number;
  currency: string;
  date: string; // YYYY-MM-DD
}

const ACTIVITIES: Activity[] = [
  // BTC
  { symbol: 'GF_BINANCE_BTCUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'BUY',  quantity: 0.030, unitPrice: 70000, fee: 0, currency: 'USD', date: '2026-01-15' },
  { symbol: 'GF_BINANCE_BTCUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'BUY',  quantity: 0.020, unitPrice: 95000, fee: 0, currency: 'USD', date: '2026-04-10' },
  // ETH
  { symbol: 'GF_BINANCE_ETHUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'BUY',  quantity: 0.500, unitPrice: 3000,  fee: 0, currency: 'USD', date: '2026-02-01' },
  { symbol: 'GF_BINANCE_ETHUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'BUY',  quantity: 0.300, unitPrice: 2500,  fee: 0, currency: 'USD', date: '2026-03-20' },
  // SOL
  { symbol: 'GF_BINANCE_SOLUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'BUY',  quantity: 5,     unitPrice: 150,   fee: 0, currency: 'USD', date: '2026-03-15' },
  { symbol: 'GF_BINANCE_SOLUSDT', dataSource: 'MANUAL', account: 'Binance Spot', type: 'SELL', quantity: 2,     unitPrice: 180,   fee: 0, currency: 'USD', date: '2026-04-25' },
  // AAPL @ IBKR
  { symbol: 'AAPL', dataSource: 'YAHOO', account: 'IBKR',  type: 'BUY',      quantity: 10, unitPrice: 180,  fee: 1,   currency: 'USD', date: '2026-01-20' },
  { symbol: 'AAPL', dataSource: 'YAHOO', account: 'IBKR',  type: 'DIVIDEND', quantity: 10, unitPrice: 0.24, fee: 0,   currency: 'USD', date: '2026-02-15' },
  { symbol: 'AAPL', dataSource: 'YAHOO', account: 'IBKR',  type: 'DIVIDEND', quantity: 10, unitPrice: 0.25, fee: 0,   currency: 'USD', date: '2026-05-15' },
  // VOO @ Nomad
  { symbol: 'VOO',  dataSource: 'YAHOO', account: 'Nomad', type: 'BUY',      quantity: 5,  unitPrice: 500,  fee: 0,   currency: 'USD', date: '2026-02-10' },
  // MSFT @ IBKR
  { symbol: 'MSFT', dataSource: 'YAHOO', account: 'IBKR',  type: 'BUY',      quantity: 4,  unitPrice: 400,  fee: 1,   currency: 'USD', date: '2026-03-05' },
  { symbol: 'MSFT', dataSource: 'YAHOO', account: 'IBKR',  type: 'DIVIDEND', quantity: 4,  unitPrice: 0.75, fee: 0,   currency: 'USD', date: '2026-04-20' },
  // PETR4 @ Inter Invest (BRL)
  { symbol: 'PETR4.SA', dataSource: 'YAHOO', account: 'Inter Invest', type: 'BUY', quantity: 100, unitPrice: 35, fee: 0, currency: 'BRL', date: '2026-03-01' },
  // BR Fund @ Inter Invest (BRL)
  { symbol: BR_FUND.symbol, dataSource: 'MANUAL', account: 'Inter Invest', type: 'BUY', quantity: 1000, unitPrice: 1.0, fee: 0, currency: 'BRL', date: '2026-01-10' }
];

// ───────────────────────── helpers ─────────────────────────

async function login(): Promise<string> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: ACCESS_TOKEN })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { authToken: string }).authToken;
}

function auth(jwt: string): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

async function listAccounts(jwt: string) {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/account`, { headers: auth(jwt) });
  if (!res.ok) throw new Error(`List accounts: ${res.status}`);
  return ((await res.json()) as { accounts: Array<{ id: string; name: string }> }).accounts;
}

async function listPlatforms(jwt: string) {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/platform`, { headers: auth(jwt) });
  if (!res.ok) throw new Error(`List platforms: ${res.status}`);
  return (await res.json()) as Array<{ id: string; name: string }>;
}

async function listActivities(jwt: string) {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/activities`, { headers: auth(jwt) });
  if (!res.ok) throw new Error(`List activities: ${res.status}`);
  return ((await res.json()) as { activities: Array<{ id: string; SymbolProfile: { symbol: string; dataSource: string }; type: string; date: string }> }).activities;
}

async function ensurePlatform(jwt: string, spec: { name: string; url: string }): Promise<string> {
  const existing = (await listPlatforms(jwt)).find(p => p.name === spec.name);
  if (existing) return existing.id;
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/platform`, {
    method: 'POST', headers: auth(jwt), body: JSON.stringify(spec)
  });
  if (!res.ok) throw new Error(`Create platform ${spec.name}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function ensureAccount(jwt: string, spec: { name: string; currency: string; balance: number; platformId: string }): Promise<string> {
  const existing = (await listAccounts(jwt)).find(a => a.name === spec.name);
  if (existing) return existing.id;
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/account`, {
    method: 'POST', headers: auth(jwt),
    body: JSON.stringify({ ...spec, isExcluded: false })
  });
  if (!res.ok) throw new Error(`Create account ${spec.name}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function ensureManualProfile(jwt: string, symbol: string): Promise<void> {
  // POST returns 201 on create, 4xx if exists; we accept both.
  await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/profile-data/MANUAL/${encodeURIComponent(symbol)}`, {
    method: 'POST', headers: auth(jwt)
  });
}

async function patchProfile(jwt: string, dataSource: 'MANUAL', symbol: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/profile-data/${dataSource}/${encodeURIComponent(symbol)}`, {
    method: 'PATCH', headers: auth(jwt), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Patch ${symbol}: ${res.status} ${await res.text()}`);
}

async function uploadMarketData(jwt: string, symbol: string, items: { date: string; marketPrice: number }[]): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/market-data/MANUAL/${encodeURIComponent(symbol)}`, {
    method: 'POST', headers: auth(jwt), body: JSON.stringify({ marketData: items })
  });
  if (!res.ok) throw new Error(`Upload market data ${symbol}: ${res.status} ${await res.text()}`);
}

async function triggerGather(jwt: string, dataSource: string, symbol: string): Promise<void> {
  await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/gather/${dataSource}/${encodeURIComponent(symbol)}?range=1d`, {
    method: 'POST', headers: auth(jwt)
  });
}

async function createActivity(jwt: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/activities`, {
    method: 'POST', headers: auth(jwt), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Create activity ${JSON.stringify(body)}: ${res.status} ${await res.text()}`);
}

async function deleteActivity(jwt: string, id: string): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/activities/${id}`, { method: 'DELETE', headers: auth(jwt) });
  if (res.status !== 200 && res.status !== 204) console.warn(`  ⚠ delete activity ${id}: ${res.status}`);
}

async function deleteProfile(jwt: string, dataSource: string, symbol: string): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/admin/profile-data/${dataSource}/${encodeURIComponent(symbol)}`, {
    method: 'DELETE', headers: auth(jwt)
  });
  if (res.status !== 200 && res.status !== 204) console.warn(`  ⚠ delete profile ${dataSource}/${symbol}: ${res.status}`);
}

async function deleteAccount(jwt: string, id: string): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/account/${id}`, { method: 'DELETE', headers: auth(jwt) });
  if (res.status !== 200 && res.status !== 204) console.warn(`  ⚠ delete account ${id}: ${res.status}`);
}

async function deletePlatform(jwt: string, id: string): Promise<void> {
  const res = await fetch(`${GHOSTFOLIO_URL}/api/v1/platform/${id}`, { method: 'DELETE', headers: auth(jwt) });
  if (res.status !== 200 && res.status !== 204) console.warn(`  ⚠ delete platform ${id}: ${res.status}`);
}

// ───────────────────────── seed flow ─────────────────────────

async function seed() {
  console.log('► Logging in…');
  const jwt = await login();

  console.log('► Ensuring Inter Invest platform + account (BRL)…');
  const platformId = await ensurePlatform(jwt, BR_PLATFORM);
  const interAccountId = await ensureAccount(jwt, {
    name: BR_ACCOUNT.name, currency: BR_ACCOUNT.currency, balance: BR_ACCOUNT.balance, platformId
  });

  const accounts = await listAccounts(jwt);
  const accountByName = new Map(accounts.map(a => [a.name, a.id]));
  accountByName.set('Inter Invest', interAccountId);
  for (const name of ['Binance Spot', 'IBKR', 'Nomad']) {
    if (!accountByName.has(name)) throw new Error(`Missing seed account ${name}. Run seed-tickerbeats-accounts.ts first.`);
  }

  console.log('► Ensuring hybrid asset profiles (BTC/ETH/SOL)…');
  for (const p of HYBRID_PROFILES) {
    await ensureManualProfile(jwt, p.symbol);
    await patchProfile(jwt, 'MANUAL', p.symbol, {
      name: p.name,
      currency: p.currency,
      assetClass: 'EQUITY',
      assetSubClass: 'CRYPTOCURRENCY',
      symbolMapping: { HYBRID: p.tvSymbol },
      scraperConfiguration: {
        url: `${HYBRID_INTERNAL_URL}/v1/quote/${encodeURIComponent(p.tvSymbol)}`,
        selector: '$.price',
        mode: 'instant'
      }
    });
  }

  console.log('► Ensuring BR fund profile + NAV history…');
  await ensureManualProfile(jwt, BR_FUND.symbol);
  await patchProfile(jwt, 'MANUAL', BR_FUND.symbol, {
    name: BR_FUND.name,
    currency: BR_FUND.currency,
    assetClass: 'EQUITY',
    assetSubClass: 'MUTUALFUND'
  });
  await uploadMarketData(jwt, BR_FUND.symbol, BR_FUND.navHistory);

  console.log('► Creating activities…');
  // De-dupe: skip activities whose (symbol, dataSource, date, type, quantity) already match an existing row.
  const existing = await listActivities(jwt);
  const seen = new Set(existing.map(a => `${a.SymbolProfile.dataSource}|${a.SymbolProfile.symbol}|${a.type}|${a.date.slice(0,10)}`));

  let created = 0, skipped = 0;
  for (const act of ACTIVITIES) {
    const key = `${act.dataSource}|${act.symbol}|${act.type}|${act.date}`;
    if (seen.has(key)) { skipped++; continue; }
    const accountId = accountByName.get(act.account);
    if (!accountId) throw new Error(`Unknown account ${act.account}`);
    await createActivity(jwt, {
      accountId,
      currency: act.currency,
      dataSource: act.dataSource,
      date: `${act.date}T00:00:00.000Z`,
      fee: act.fee,
      quantity: act.quantity,
      symbol: act.symbol,
      type: act.type,
      unitPrice: act.unitPrice
    });
    created++;
  }
  console.log(`  created=${created}  skipped=${skipped}`);

  console.log('► Triggering gather for MANUAL symbols (hybrid scrape into MarketData)…');
  for (const p of HYBRID_PROFILES) await triggerGather(jwt, 'MANUAL', p.symbol);
  await triggerGather(jwt, 'MANUAL', BR_FUND.symbol);

  console.log('► Done. Summary follows after a 5s settle for async gather jobs.');
  await new Promise(r => setTimeout(r, 5000));
  await summary(jwt);
}

// ───────────────────────── teardown flow ─────────────────────────

async function teardown() {
  console.log('► Logging in…');
  const jwt = await login();

  console.log('► Deleting activities created by this script…');
  const existing = await listActivities(jwt);
  const ourSymbols = new Set<string>([
    ...HYBRID_PROFILES.map(p => p.symbol),
    BR_FUND.symbol,
    ...YAHOO_SYMBOLS
  ]);
  let deleted = 0;
  for (const a of existing) {
    if (ourSymbols.has(a.SymbolProfile.symbol)) { await deleteActivity(jwt, a.id); deleted++; }
  }
  console.log(`  deleted ${deleted} activities`);

  console.log('► Deleting hybrid + BR fund asset profiles (MANUAL)…');
  for (const p of HYBRID_PROFILES) await deleteProfile(jwt, 'MANUAL', p.symbol);
  await deleteProfile(jwt, 'MANUAL', BR_FUND.symbol);

  console.log('► Deleting Yahoo profiles (AAPL/MSFT/VOO/PETR4.SA)…');
  for (const s of YAHOO_SYMBOLS) await deleteProfile(jwt, 'YAHOO', s);

  console.log('► Deleting Inter Invest account + platform…');
  const accounts = await listAccounts(jwt);
  const interAcct = accounts.find(a => a.name === BR_ACCOUNT.name);
  if (interAcct) await deleteAccount(jwt, interAcct.id);
  const platforms = await listPlatforms(jwt);
  const interPlat = platforms.find(p => p.name === BR_PLATFORM.name);
  if (interPlat) await deletePlatform(jwt, interPlat.id);

  // Sweep the legacy GF_BTCUSDT_HYBRID artefact from the earlier smoke test if present
  console.log('► Sweeping legacy GF_BTCUSDT_HYBRID artefact (if any)…');
  const legacy = (await listActivities(jwt)).filter(a => a.SymbolProfile.symbol === 'GF_BTCUSDT_HYBRID');
  for (const a of legacy) await deleteActivity(jwt, a.id);
  await deleteProfile(jwt, 'MANUAL', 'GF_BTCUSDT_HYBRID');

  console.log('► Done.');
}

// ───────────────────────── summary ─────────────────────────

async function summary(jwt: string) {
  const holdings = await fetch(`${GHOSTFOLIO_URL}/api/v1/portfolio/holdings`, { headers: auth(jwt) })
    .then(r => r.json() as Promise<{ holdings: Array<{ symbol: string; name: string; dataSource: string; quantity: number; marketPrice: number; valueInBaseCurrency: number; netPerformancePercent: number; currency: string }> }>);
  console.log('\nHoldings:');
  for (const h of holdings.holdings.sort((a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency)) {
    const label = (h.name ?? h.symbol ?? '<unnamed>').padEnd(40);
    console.log(`  ${label}  ${h.dataSource.padEnd(7)}  qty=${h.quantity.toString().padStart(8)}  px=${h.marketPrice.toFixed(2).padStart(10)} ${h.currency}  → ${h.valueInBaseCurrency.toFixed(2).padStart(10)} ${h.currency}  (${(h.netPerformancePercent * 100).toFixed(2)}%)`);
  }
  const total = holdings.holdings.reduce((s, h) => s + h.valueInBaseCurrency, 0);
  console.log(`\n  Total portfolio value (base currency): ${total.toFixed(2)} USD across ${holdings.holdings.length} holdings.`);
}

// ───────────────────────── main ─────────────────────────

(TEARDOWN ? teardown() : seed()).catch(err => { console.error(err); process.exit(1); });
