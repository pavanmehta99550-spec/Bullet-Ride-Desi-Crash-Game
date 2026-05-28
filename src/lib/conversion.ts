// src/lib/conversion.ts

export const formatBetAmount = (amount: number, coinTicker: string) => {
  if (['BTC', 'ETH'].includes(coinTicker)) {
    return amount.toFixed(8);
  }
  return amount.toFixed(2);
};

export const calculateFiatValue = (amount: number, coinTicker: string, rates: Record<string, number>) => {
  const price = rates[coinTicker];
  if (!price) return null;
  return amount * price;
};
