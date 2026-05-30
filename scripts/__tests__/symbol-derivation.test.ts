import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTvSymbol,
  deriveYahooSymbol,
  ghostfolioAssetClass,
  ghostfolioAssetSubClass
} from '../lib/symbol-derivation.ts';

describe('deriveTvSymbol', () => {
  it('translates GF_<EXCHANGE>_<TICKER> to <EXCHANGE>:<TICKER>', () => {
    assert.equal(deriveTvSymbol('GF_BINANCE_BTCUSDT'), 'BINANCE:BTCUSDT');
    assert.equal(deriveTvSymbol('GF_NASDAQ_AAPL'),     'NASDAQ:AAPL');
    assert.equal(deriveTvSymbol('GF_BMFBOVESPA_PETR4'), 'BMFBOVESPA:PETR4');
  });

  it('preserves underscores after the first exchange separator', () => {
    // GF_BR_FUND_<CNPJ>: exchange = BR, ticker = FUND_<CNPJ>. The intention
    // is just to be deterministic — BR fund symbols bypass hybrid in practice,
    // but the function still produces a stable mapping.
    assert.equal(deriveTvSymbol('GF_BR_FUND_12345678000190'), 'BR:FUND_12345678000190');
  });

  it('throws when the symbol does not start with GF_', () => {
    assert.throws(() => deriveTvSymbol('BTCUSDT'),        /must start with "GF_"/);
    assert.throws(() => deriveTvSymbol('gf_NASDAQ_AAPL'), /must start with "GF_"/);
    assert.throws(() => deriveTvSymbol(''),               /must start with "GF_"/);
  });

  it('throws when there is no exchange segment after GF_', () => {
    assert.throws(() => deriveTvSymbol('GF_BTCUSDT'),     /missing exchange segment/);
    assert.throws(() => deriveTvSymbol('GF_'),            /missing exchange segment/);
  });
});

describe('deriveYahooSymbol', () => {
  it('returns the explicit yahooSymbol override when present', () => {
    const got = deriveYahooSymbol({
      symbol: 'GF_BMFBOVESPA_PETR4',
      assetClass: 'EQUITY',
      yahooSymbol: 'PETR4.SA'
    });
    assert.equal(got, 'PETR4.SA');
  });

  it('returns undefined for non-equity / non-ETF asset classes', () => {
    assert.equal(deriveYahooSymbol({ symbol: 'GF_BINANCE_BTCUSDT', assetClass: 'CRYPTO' }), undefined);
    assert.equal(deriveYahooSymbol({ symbol: 'GF_BR_FUND_12345678000190', assetClass: 'FUND' }), undefined);
  });

  it('maps NASDAQ/NYSE/AMEX equities to a bare ticker', () => {
    assert.equal(deriveYahooSymbol({ symbol: 'GF_NASDAQ_AAPL', assetClass: 'EQUITY' }), 'AAPL');
    assert.equal(deriveYahooSymbol({ symbol: 'GF_NYSE_VOO',    assetClass: 'ETF'    }), 'VOO');
    assert.equal(deriveYahooSymbol({ symbol: 'GF_AMEX_SPY',    assetClass: 'ETF'    }), 'SPY');
  });

  it('appends Yahoo exchange suffixes for known international exchanges', () => {
    assert.equal(deriveYahooSymbol({ symbol: 'GF_BMFBOVESPA_PETR4', assetClass: 'EQUITY' }), 'PETR4.SA');
    assert.equal(deriveYahooSymbol({ symbol: 'GF_BVMF_ITSA4',       assetClass: 'EQUITY' }), 'ITSA4.SA');
    assert.equal(deriveYahooSymbol({ symbol: 'GF_LSE_VOD',          assetClass: 'EQUITY' }), 'VOD.L');
    assert.equal(deriveYahooSymbol({ symbol: 'GF_TSX_RY',           assetClass: 'EQUITY' }), 'RY.TO');
  });

  it('returns undefined for unknown exchanges', () => {
    assert.equal(deriveYahooSymbol({ symbol: 'GF_FRANKFURT_SAP', assetClass: 'EQUITY' }), undefined);
  });

  it('uses an explicit tvSymbol override instead of deriving from symbol', () => {
    const got = deriveYahooSymbol({
      symbol:   'GF_CUSTOM_X',
      tvSymbol: 'NASDAQ:GOOGL',
      assetClass: 'EQUITY'
    });
    assert.equal(got, 'GOOGL');
  });
});

describe('ghostfolioAssetClass', () => {
  it('always returns EQUITY (Ghostfolio enum has no CRYPTO at class level)', () => {
    assert.equal(ghostfolioAssetClass({ symbol: 'GF_BINANCE_BTCUSDT', assetClass: 'CRYPTO' }), 'EQUITY');
    assert.equal(ghostfolioAssetClass({ symbol: 'GF_NASDAQ_AAPL',     assetClass: 'EQUITY' }), 'EQUITY');
    assert.equal(ghostfolioAssetClass({ symbol: 'GF_NYSE_VOO',        assetClass: 'ETF'    }), 'EQUITY');
    assert.equal(ghostfolioAssetClass({ symbol: 'GF_BR_FUND_X',       assetClass: 'FUND'   }), 'EQUITY');
  });
});

describe('ghostfolioAssetSubClass', () => {
  it('maps each hybrid asset class to its Ghostfolio sub-class', () => {
    assert.equal(ghostfolioAssetSubClass({ symbol: 'GF_X_Y', assetClass: 'CRYPTO' }), 'CRYPTOCURRENCY');
    assert.equal(ghostfolioAssetSubClass({ symbol: 'GF_X_Y', assetClass: 'ETF'    }), 'ETF');
    assert.equal(ghostfolioAssetSubClass({ symbol: 'GF_X_Y', assetClass: 'FUND'   }), 'MUTUALFUND');
    assert.equal(ghostfolioAssetSubClass({ symbol: 'GF_X_Y', assetClass: 'EQUITY' }), 'STOCK');
  });
});
