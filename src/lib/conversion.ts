// src/lib/conversion.ts
import { cryptoConfig } from './cryptoConfig';

export const formatBetAmount = (amount: number, coinTicker: string) => {
  const config = cryptoConfig[coinTicker];
  const decimals = config ? config.decimals : 2;
  return amount.toFixed(decimals);
};

export const calculateFiatValue = (amount: number, coinTicker: string, rates: Record<string, number>) => {
  const price = rates[coinTicker];
  if (!price) return null;
  const converted = amount * price;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(converted);
};
