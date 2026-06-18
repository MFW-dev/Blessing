import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const USER_CONFIG_PATH = path.resolve(process.cwd(), "user-config.json");

export const config = {
  mode: "live_trading",
  budgetSol: 0.377,
  smartWallet: {
    minClusterMatch: 2,
    targetWallets: [] // Dikosongkan agar murni mengambil dari file saat diload
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
    autoTakeProfitPct: 30,
    maxHoldTimeMinutes: 45
  }
};

export function normalizeMode(mode = config.mode) {
  const value = String(mode || "").trim().toLowerCase();

  if (value === "paper") return "paper_trading";
  if (value === "live") return "live_trading";

  return value;
}

export function isPaperTrading(mode = config.mode) {
  return normalizeMode(mode) === "paper_trading";
}

export function isLiveTrading(mode = config.mode) {
  return normalizeMode(mode) === "live_trading";
}

export function modeLabel(mode = config.mode) {
  if (isPaperTrading(mode)) return "paper";
  if (isLiveTrading(mode)) return "live";
  return "unknown";
}

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY || "",
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || "",
  JUPITER_API_BASE_URL: process.env.JUPITER_API_BASE_URL || "https://lite-api.jup.ag/swap/v1",
  JUPITER_API_KEY: process.env.JUPITER_API_KEY || "",
  
  RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  WSS_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
};

// Fungsi memuat user-config.json
export function loadConfig() {
  if (fs.existsSync(USER_CONFIG_PATH)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"));
      if (userConfig.targetWallets) {
        config.smartWallet.targetWallets = userConfig.targetWallets;
      }
    } catch (error) {
      console.error("[Config Error] Gagal membaca user-config.json:", error.message);
    }
  }
}

// Fungsi BARU: Menyimpan perubahan target wallet dari Telegram
export function saveConfig() {
  try {
    const dataToSave = {
      targetWallets: config.smartWallet.targetWallets
    };
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error("[Config Error] Gagal menyimpan user-config.json:", error.message);
  }
}

// Jalankan saat file di-import
loadConfig();
