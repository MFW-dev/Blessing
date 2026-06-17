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
    targetWallets: [
      "4EtAJ1p8RjqccEVhEhaYnEgQ6kA4JHR8oYqyLFwARUj6", // 1. 90D Smart Trader (~$44.24M profit)
      "HWdeCUjBvPP1HJ5oCJt7aNsvMWpWoDgiejUWvfFX6T7R", // 2. Multiple Memecoin Whale (~$4.38M profit)
      "fwHknyxZTgFGytVz9VPrvWqipW2V4L4D99gEb831t81",  // 3. AI16Z / AI token trader (~$1.53M profit)
      "3xqUaVuAWsppb8yaSPJ2hvdvfjteMq2EbdCc3CLguaTE", // 4. New token specialist (~$3.3M profit)
      "9UWZFoiCHeYRLmzmDJhdMrP7wgrTw7DMSpPiT2eHgJHe", // 5. Gaming token specialist (~$4.3M profit)
      "BKVaB3eNrGUVRCj3M4LiodKypBTzrpatoo7VBhmdv3eY", // 6. AI coins specialist (~$990K profit)
      "9HCTuTPEiQvkUtLmTZvK6uch4E3pDynwJTbNw6jLhp9z", // 7. TRUMP / new crypto trader
      "6kbwsSY4hL6WVadLRLnWV2irkMN2AvFZVAS8McKJmAtJ", // 8. High-risk smart trader
      "5fWkLJfoDsRAaXhPJcJY19qNtDDQ5h6q1SPzsAPRrUNG", // 9. Meme coin specialist
      "H4SSLANdxDNRCW6Qkk9w5EXi1Z27WjqQbsAiEqwFcKDQ"  // 10. Solana whale / TRUMP trader
    ]
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