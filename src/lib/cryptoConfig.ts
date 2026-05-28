// src/lib/cryptoConfig.ts

export interface CryptoConfig {
  min: number;
  conf: number;
}

export const cryptoConfig: Record<string, CryptoConfig> = {
  BTC: { min: 0.0001, conf: 2 },
  ETH: { min: 0.005, conf: 12 },
  USDT: { min: 10, conf: 1 },
  SOL: { min: 0.1, conf: 1 },
  DOGE: { min: 10, conf: 1 },
  LTC: { min: 0.05, conf: 1 },
  TRX: { min: 20, conf: 1 },
  BNB: { min: 0.02, conf: 1 },
  XRP: { min: 10, conf: 1 },
  MATIC: { min: 5, conf: 1 },
  TON: { min: 2, conf: 1 },
  ADA: { min: 5, conf: 1 },
  BCH: { min: 0.01, conf: 1 },
  DASH: { min: 0.1, conf: 1 },
  DGB: { min: 50, conf: 1 },
  FEY: { min: 100, conf: 1 },
  LINK: { min: 1, conf: 1 },
  DOT: { min: 1, conf: 1 },
  INR: { min: 100, conf: 0 },
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
