import { Big } from 'big.js';
import { subDays, subMonths } from 'date-fns';

import {
  getAnnualizedPerformancePercent,
  getIntervalFromDateRange
} from './calculation-helper';
import { resetHours } from './helper';

describe('CalculationHelper', () => {
  describe('annualized performance percentage', () => {
    it('Get annualized performance', async () => {
      expect(
        getAnnualizedPerformancePercent({
          daysInMarket: NaN, // differenceInDays of date-fns returns NaN for the same day
          netPerformancePercentage: new Big(0)
        }).toNumber()
      ).toEqual(0);

      expect(
        getAnnualizedPerformancePercent({
          daysInMarket: 0,
          netPerformancePercentage: new Big(0)
        }).toNumber()
      ).toEqual(0);

      /**
       * Source: https://www.readyratios.com/reference/analysis/annualized_rate.html
       */
      expect(
        getAnnualizedPerformancePercent({
          daysInMarket: 65, // < 1 year
          netPerformancePercentage: new Big(0.1025)
        }).toNumber()
      ).toBeCloseTo(0.729705);

      expect(
        getAnnualizedPerformancePercent({
          daysInMarket: 365, // 1 year
          netPerformancePercentage: new Big(0.05)
        }).toNumber()
      ).toBeCloseTo(0.05);

      /**
       * Source: https://www.investopedia.com/terms/a/annualized-total-return.asp#annualized-return-formula-and-calculation
       */
      expect(
        getAnnualizedPerformancePercent({
          daysInMarket: 575, // > 1 year
          netPerformancePercentage: new Big(0.2374)
        }).toNumber()
      ).toBeCloseTo(0.145);
    });
  });

  describe('getIntervalFromDateRange', () => {
    it('derives a rolling 1-week start date', () => {
      const { startDate } = getIntervalFromDateRange({ dateRange: '1w' });

      expect(startDate).toEqual(subDays(resetHours(new Date()), 7));
    });

    it('derives a rolling 1-month start date', () => {
      const { startDate } = getIntervalFromDateRange({ dateRange: '1m' });

      expect(startDate).toEqual(subMonths(resetHours(new Date()), 1));
    });

    it('derives a rolling 3-month start date', () => {
      const { startDate } = getIntervalFromDateRange({ dateRange: '3m' });

      expect(startDate).toEqual(subMonths(resetHours(new Date()), 3));
    });

    it('derives a rolling 6-month start date', () => {
      const { startDate } = getIntervalFromDateRange({ dateRange: '6m' });

      expect(startDate).toEqual(subMonths(resetHours(new Date()), 6));
    });

    it('respects a later explicit startDate (max clamping)', () => {
      // Today is always after "3 months ago", so max() keeps the explicit date.
      const explicitStart = resetHours(new Date());

      const { startDate } = getIntervalFromDateRange({
        dateRange: '3m',
        startDate: explicitStart
      });

      expect(startDate).toEqual(explicitStart);
    });
  });
});
