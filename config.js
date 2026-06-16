import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Membaca file .env
dotenv.config();

const USER_CONFIG_PATH = path.resolve(process.cwd(), "user-config.json");

// Konfigurasi dinamis (strategi trading)
export const config = {
  mode: "paper_trading",
  budgetSol: 0.377,
  smartWallet: {
    minClusterMatch: 2,
    targetWallets: []
  },
  antiRug: {
    minLiquidityUsd: 5000,
    rejectMintable: true,
    rejectFreezable: true,
    maxTop10HoldersPct: 30
  },
  trading: {
    paperTradeAmountSol: 0.01,
    semiAutoAmountSol: 0.01,
    autoStopLossPct: 20,
    autoTakeProfitPct: 30, // Jual 50% saat profit 30%
    maxHoldTimeMinutes: 45
  }
};

// Konfigurasi statis (kredensial API dari .env)
export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY || "",
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || "",
  
  // Dirakit otomatis oleh bot
  RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  WSS_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
};

// Fungsi memuat user-config.json (jika ada)
export function loadConfig() {
  if (fs.existsSync(USER_CONFIG_PATH)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"));
      Object.assign(config, userConfig);
    } catch (error) {
      console.error("[Config Error] Gagal membaca user-config.json:", error.message);
    }
  }
}

// Jalankan saat file di-import
loadConfig();