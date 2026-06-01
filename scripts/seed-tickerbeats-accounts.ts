/**
 * Seed Tickerbeats brokerage platforms and accounts into a fresh Ghostfolio instance.
 *
 * Usage:
 *   GHOSTFOLIO_ACCESS_TOKEN=<128-char-security-token> \
 *   [GHOSTFOLIO_API_URL=http://localhost:3333] \
 *   npx tsx scripts/seed-tickerbeats-accounts.ts
 *
 * Idempotent: re-running skips platforms/accounts whose name already exists.
 */

interface PlatformSpec {
  name: string;
  url: string;
}

interface AccountSpec {
  name: string;
  platformName: string;
  currency: string;
  balance: number;
}

const PLATFORMS: PlatformSpec[] = [
  { name: 'Binance', url: 'https://www.binance.com' },
  { name: 'OKX', url: 'https://www.okx.com' },
  { name: 'Interactive Brokers', url: 'https://www.interactivebrokers.com' },
  { name: 'Nomad Global', url: 'https://www.nomadglobal.com' },
  // url drives the account icon: Ghostfolio fetches the favicon from the
  // platform url at runtime (logo.service.ts), it does not store an image.
  { name: 'XP Investimentos', url: 'https://xpi.com.br' },
  { name: 'BTG Pactual', url: 'https://btgpactual.com' }
];

const ACCOUNTS: AccountSpec[] = [
  { name: 'Binance Spot', platformName: 'Binance', currency: 'USD', balance: 0 },
  { name: 'OKX Spot', platformName: 'OKX', currency: 'USD', balance: 0 },
  { name: 'IBKR', platformName: 'Interactive Brokers', currency: 'USD', balance: 0 },
  { name: 'Nomad', platformName: 'Nomad Global', currency: 'USD', balance: 0 },
  { name: 'XP Investimentos', platformName: 'XP Investimentos', currency: 'BRL', balance: 0 },
  { name: 'BTG Investimentos', platformName: 'BTG Pactual', currency: 'BRL', balance: 0 }
];

const API_URL = (process.env.GHOSTFOLIO_API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const ACCESS_TOKEN = process.env.GHOSTFOLIO_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error(
    'ERROR: GHOSTFOLIO_ACCESS_TOKEN is required (the 128-character security token shown when the admin user was created).'
  );
  process.exit(1);
}

async function login(): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: ACCESS_TOKEN })
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const { authToken } = (await res.json()) as { authToken: string };
  return authToken;
}

async function listPlatforms(jwt: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API_URL}/api/v1/platform`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  if (!res.ok) throw new Error(`List platforms failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Array<{ id: string; name: string }>;
}

async function createPlatform(jwt: string, spec: PlatformSpec): Promise<{ id: string; name: string }> {
  const res = await fetch(`${API_URL}/api/v1/platform`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(spec)
  });
  if (!res.ok) throw new Error(`Create platform ${spec.name} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

async function listAccounts(jwt: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${API_URL}/api/v1/account`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  if (!res.ok) throw new Error(`List accounts failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { accounts: Array<{ id: string; name: string }> };
  return body.accounts ?? [];
}

async function createAccount(
  jwt: string,
  spec: AccountSpec,
  platformId: string
): Promise<{ id: string; name: string }> {
  const payload = {
    name: spec.name,
    platformId,
    currency: spec.currency,
    balance: spec.balance,
    isExcluded: false
  };
  const res = await fetch(`${API_URL}/api/v1/account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Create account ${spec.name} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

async function main() {
  console.log(`Logging in to ${API_URL}...`);
  const jwt = await login();

  console.log('Fetching existing platforms...');
  const existingPlatforms = await listPlatforms(jwt);
  const platformByName = new Map(existingPlatforms.map((p) => [p.name, p]));

  for (const spec of PLATFORMS) {
    if (platformByName.has(spec.name)) {
      console.log(`  - ${spec.name}: already exists (${platformByName.get(spec.name)!.id})`);
    } else {
      const created = await createPlatform(jwt, spec);
      platformByName.set(spec.name, created);
      console.log(`  + ${spec.name}: created (${created.id})`);
    }
  }

  console.log('Fetching existing accounts...');
  const existingAccounts = await listAccounts(jwt);
  const accountNames = new Set(existingAccounts.map((a) => a.name));

  for (const spec of ACCOUNTS) {
    if (accountNames.has(spec.name)) {
      console.log(`  - ${spec.name}: already exists`);
      continue;
    }
    const platform = platformByName.get(spec.platformName);
    if (!platform) {
      throw new Error(`Platform ${spec.platformName} not found for account ${spec.name}`);
    }
    const created = await createAccount(jwt, spec, platform.id);
    console.log(`  + ${spec.name}: created (${created.id}, platform=${spec.platformName})`);
  }

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
