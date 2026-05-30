// src/lib/cryptoConfig.ts

export interface CryptoConfig {
  min: number;
  conf: number;
  decimals: number;
  isVisible: boolean;
}

export const cryptoConfig: Record<string, CryptoConfig> = {
  BTC: { min: 0.0001, conf: 2, decimals: 8, isVisible: true },
  ETH: { min: 0.005, conf: 12, decimals: 6, isVisible: true },
  USDT: { min: 10, conf: 1, decimals: 2, isVisible: true },
  SOL: { min: 0.1, conf: 1, decimals: 4, isVisible: true },
  DOGE: { min: 10, conf: 1, decimals: 4, isVisible: true },
  LTC: { min: 0.05, conf: 1, decimals: 4, isVisible: true },
  TRX: { min: 20, conf: 1, decimals: 2, isVisible: true },
  BNB: { min: 0.02, conf: 1, decimals: 4, isVisible: true },
  XRP: { min: 10, conf: 1, decimals: 2, isVisible: true },
  MATIC: { min: 5, conf: 1, decimals: 2, isVisible: true },
  TON: { min: 2, conf: 1, decimals: 2, isVisible: true },
  ADA: { min: 5, conf: 1, decimals: 2, isVisible: true },
  BCH: { min: 0.01, conf: 1, decimals: 4, isVisible: true },
  DASH: { min: 0.1, conf: 1, decimals: 4, isVisible: true },
  DGB: { min: 50, conf: 1, decimals: 2, isVisible: true },
  FEY: { min: 100, conf: 1, decimals: 2, isVisible: true },
  LINK: { min: 1, conf: 1, decimals: 2, isVisible: true },
  DOT: { min: 1, conf: 1, decimals: 2, isVisible: true },
  XMR: { min: 0.0001, conf: 2, decimals: 8, isVisible: true },
  TARA: { min: 0.0001, conf: 2, decimals: 8, isVisible: true },
  INR: { min: 100, conf: 0, decimals: 2, isVisible: true },
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
