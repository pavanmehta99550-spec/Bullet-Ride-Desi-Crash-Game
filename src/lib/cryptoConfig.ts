// src/lib/cryptoConfig.ts

export interface CryptoConfig {
  min: number;
  conf: number;
  decimals: number;
}

export const cryptoConfig: Record<string, CryptoConfig> = {
  BTC: { min: 0.0001, conf: 2, decimals: 8 },
  ETH: { min: 0.005, conf: 12, decimals: 6 },
  USDT: { min: 10, conf: 1, decimals: 2 },
  SOL: { min: 0.1, conf: 1, decimals: 4 },
  DOGE: { min: 10, conf: 1, decimals: 4 },
  LTC: { min: 0.05, conf: 1, decimals: 4 },
  TRX: { min: 20, conf: 1, decimals: 2 },
  BNB: { min: 0.02, conf: 1, decimals: 4 },
  XRP: { min: 10, conf: 1, decimals: 2 },
  MATIC: { min: 5, conf: 1, decimals: 2 },
  TON: { min: 2, conf: 1, decimals: 2 },
  ADA: { min: 5, conf: 1, decimals: 2 },
  BCH: { min: 0.01, conf: 1, decimals: 4 },
  DASH: { min: 0.1, conf: 1, decimals: 4 },
  DGB: { min: 50, conf: 1, decimals: 2 },
  FEY: { min: 100, conf: 1, decimals: 2 },
  LINK: { min: 1, conf: 1, decimals: 2 },
  DOT: { min: 1, conf: 1, decimals: 2 },
  INR: { min: 100, conf: 0, decimals: 2 },
};

export const validateDeposit = (coin: string, amount: number) => {
  const config = cryptoConfig[coin];
  if (!config) {
    return { isValid: false, message: 'Invalid cryptocurrency selected.' };
  }
  if (amount < config.min) {
    return { isValid: false, message: `Minimum deposit for ${coin} is ${config.min}` };
  }
  return { isValid: true };
};
