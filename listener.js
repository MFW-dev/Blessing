import { Connection, PublicKey } from '@solana/web3.js';
import { env, config } from './config.js';

const connection = new Connection(env.RPC_URL, {
  wsEndpoint: env.WSS_URL,
});

// Kita menambahkan parameter "onTransactionDetected" agar Listener bisa mengirim data ke index.js
export function startListening(onTransactionDetected) {
  console.log("========================================");
  console.log("[Engine] Menghubungkan ke Helius WSS...");
  
  if (config.smartWallet.targetWallets.length === 0) return;

  config.smartWallet.targetWallets.forEach((walletAddress) => {
    try {
      const pubKey = new PublicKey(walletAddress);
      
      // Menggunakan onLogs untuk mendapatkan "signature" (ID Transaksi)
      connection.onLogs(pubKey, (logs) => {
        // Abaikan transaksi yang gagal (error)
        if (logs.err) return; 

        console.log(`\n[⚡ ACTIVITY] Dompet ${walletAddress.slice(0,6)}... melakukan transaksi!`);
        // Kirim ID Transaksi ke file utama (index.js)
        onTransactionDetected(walletAddress, logs.signature);
        
      }, 'confirmed');

      console.log(`[Listener] Berhasil memantau dompet: ${walletAddress}`);
    } catch (error) {
      console.error(`[Error] Alamat dompet tidak valid: ${walletAddress}`);
    }
  });
  
  console.log("========================================");
  console.log("[Engine] Bot standby menunggu transaksi nyata...");
}