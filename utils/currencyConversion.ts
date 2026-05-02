import { CurrencyExchangeRate, PaymentCurrency } from '../types';

const roundCurrency = (value: number): number => {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
};

export const getApplicableExchangeRate = (
  rates: CurrencyExchangeRate[],
  fromCurrency: PaymentCurrency,
  toCurrency: PaymentCurrency,
  effectiveDate?: string
): number | null => {
  if (fromCurrency === toCurrency) return 1;
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const targetDate = effectiveDate ? effectiveDate.slice(0, 10) : localDate;
  const candidates = rates.filter((rate) => {
    return rate.fromCurrency === fromCurrency
      && rate.toCurrency === toCurrency
      && rate.effectiveDate <= targetDate;
  });

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (left.effectiveDate === right.effectiveDate) {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return right.effectiveDate.localeCompare(left.effectiveDate);
  });

  const resolvedRate = Number(candidates[0]?.rate || 0);
  return resolvedRate > 0 ? resolvedRate : null;
};

export const convertCurrencyAmount = (
  amount: number,
  rates: CurrencyExchangeRate[],
  fromCurrency: PaymentCurrency,
  toCurrency: PaymentCurrency,
  effectiveDate?: string
): number | null => {
  const resolvedRate = getApplicableExchangeRate(rates, fromCurrency, toCurrency, effectiveDate);
  if (resolvedRate == null) return null;
  return roundCurrency(amount * resolvedRate);
};
