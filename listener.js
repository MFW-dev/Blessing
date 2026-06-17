import { Connection, PublicKey } from '@solana/web3.js';
import { env, config } from './config.js';

const connection = new Connection(env.RPC_URL, {
  wsEndpoint: env.WSS_URL,
});

// Menyimpan ID Telinga (Subscription) agar bisa dicopot sewaktu-waktu
const activeSubscriptions = new Map();
let globalCallback = null;

export function startListening(onTransactionDetected) {
  globalCallback = onTransactionDetected;
  console.log("========================================");
  console.log("[Engine] Menghubungkan ke Helius WSS...");
  
  // Pasang telinga untuk semua wallet yang ada di memori saat bot nyala
  config.smartWallet.targetWallets.forEach((walletAddress) => {
    addWalletListener(walletAddress);
  });
  
  console.log("========================================");
  console.log("[Engine] Bot standby menunggu transaksi nyata...");
}

// Fungsi BARU: Menambah pantauan tanpa merestart bot
export function addWalletListener(walletAddress) {
  if (activeSubscriptions.has(walletAddress)) return;

  try {
    const pubKey = new PublicKey(walletAddress);
    const subId = connection.onLogs(pubKey, (logs) => {
      if (logs.err) return; 
      console.log(`\n[⚡ ACTIVITY] Dompet ${walletAddress.slice(0,6)}... melakukan transaksi!`);
      if (globalCallback) globalCallback(walletAddress, logs.signature);
    }, 'confirmed');

    activeSubscriptions.set(walletAddress, subId);
    console.log(`[Listener] 🟢 Mulai memantau dompet: ${walletAddress}`);
  } catch (error) {
    console.error(`[Error] Alamat dompet tidak valid: ${walletAddress}`);
  }
}

// Fungsi BARU: Menghapus pantauan tanpa merestart bot
export function removeWalletListener(walletAddress) {
  const subId = activeSubscriptions.get(walletAddress);
  if (subId !== undefined) {
    connection.removeOnLogsListener(subId);
    activeSubscriptions.delete(walletAddress);
    console.log(`[Listener] 🔴 Berhenti memantau dompet: ${walletAddress}`);
  }
}