/**
 * Pure helpers for translating between Ghostfolio symbols, hybrid-data-svc
 * TradingView identifiers, and Yahoo fallback tickers. Extracted from the
 * register-asset.ts CLI so they can be unit-tested in isolation.
 */

export type HybridAssetClass = 'EQUITY' | 'CRYPTO' | 'ETF' | 'FUND';

export type GhostfolioAssetClass =
  | 'EQUITY' | 'COMMODITY' | 'FIXED_INCOME' | 'LIQUIDITY' | 'REAL_ESTATE' | 'ALTERNATIVE_INVESTMENT';

export type GhostfolioAssetSubClass =
  | 'STOCK' | 'ETF' | 'BOND' | 'CASH' | 'COLLECTIBLE' | 'COMMODITY'
  | 'CRYPTOCURRENCY' | 'LOAN' | 'MUTUALFUND' | 'PRECIOUS_METAL' | 'PRIVATE_EQUITY';

export interface SymbolSpec {
  symbol: string;
  assetClass: HybridAssetClass;
  tvSymbol?: string;
  yahooSymbol?: string;
}

/**
 * GF_<EXCHANGE>_<TICKER>  →  <EXCHANGE>:<TICKER>
 *
 * The first underscore after GF_ separates exchange from ticker; the rest is
 * preserved verbatim (so multi-segment tickers like GF_BR_FUND_<CNPJ> keep
 * the second underscore — those symbols aren't sent to hybrid anyway, but
 * the function stays consistent).
 *
 * @throws Error when the symbol doesn't start with GF_ or has no exchange segment.
 */
export function deriveTvSymbol(gfSymbol: string): string {
  if (!gfSymbol.startsWith('GF_')) {
    throw new Error(`Symbol must start with "GF_": got ${gfSymbol}`);
  }
  const rest = gfSymbol.slice(3);
  const firstUnderscore = rest.indexOf('_');
  if (firstUnderscore < 0) {
    throw new Error(`Symbol ${gfSymbol} missing exchange segment (expected GF_<EXCHANGE>_<TICKER>).`);
  }
  return `${rest.slice(0, firstUnderscore)}:${rest.slice(firstUnderscore + 1)}`;
}

/**
 * Derive the Yahoo Finance ticker fallback from a hybrid TradingView symbol.
 * Returns undefined when the asset class is not equity/ETF or when the
 * exchange has no Yahoo mapping. Callers may pass an explicit yahooSymbol on
 * the spec to bypass the heuristic entirely.
 */
export function deriveYahooSymbol(spec: SymbolSpec): string | undefined {
  if (spec.yahooSymbol) return spec.yahooSymbol;
  if (spec.assetClass !== 'EQUITY' && spec.assetClass !== 'ETF') return undefined;

  const tv = spec.tvSymbol ?? deriveTvSymbol(spec.symbol);
  const [exchange, ticker] = tv.split(':');
  switch (exchange) {
    case 'NASDAQ':
    case 'NYSE':
    case 'AMEX':         return ticker;
    case 'BMFBOVESPA':
    case 'BVMF':         return `${ticker}.SA`;
    case 'LSE':          return `${ticker}.L`;
    case 'TSX':          return `${ticker}.TO`;
    default:             return undefined;
  }
}

/**
 * Ghostfolio's AssetClass enum has no "CRYPTO" value; crypto positions are
 * modelled as EQUITY at the asset-class level and CRYPTOCURRENCY at the
 * sub-class level. Other hybrid classes also map to EQUITY here — none of
 * them have a better Ghostfolio AssetClass slot in the current schema.
 */
export function ghostfolioAssetClass(_spec: SymbolSpec): GhostfolioAssetClass {
  return 'EQUITY';
}

export function ghostfolioAssetSubClass(spec: SymbolSpec): GhostfolioAssetSubClass {
  switch (spec.assetClass) {
    case 'CRYPTO': return 'CRYPTOCURRENCY';
    case 'ETF':    return 'ETF';
    case 'FUND':   return 'MUTUALFUND';
    case 'EQUITY': return 'STOCK';
  }
}
