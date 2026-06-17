import { Connection, PublicKey } from '@solana/web3.js';
import { env, config } from './config.js';
import { sendSignalAlert } from './telegram.js';

// Setup koneksi ke Helius (menggunakan WSS untuk real-time tanpa boros kuota)
const connection = new Connection(env.RPC_URL, {
  wsEndpoint: env.WSS_URL,
});

export function startListening() {
  console.log("========================================");
  console.log("[Engine] Menghubungkan ke Helius WSS...");
  
  // Cek apakah ada wallet yang dipantau
  if (config.smartWallet.targetWallets.length === 0) {
    console.log("[Peringatan] Daftar targetWallets kosong di config.");
    console.log("[Peringatan] Masukkan setidaknya 1 alamat dompet Solana untuk dites.");
    return;
  }

  // Melakukan perulangan untuk setiap dompet yang ada di konfigurasi
  config.smartWallet.targetWallets.forEach((walletAddress) => {
    try {
      const pubKey = new PublicKey(walletAddress);
      
      // Membuka "telinga" (listener) untuk dompet ini
      connection.onAccountChange(pubKey, (accountInfo) => {
        console.log(`\n[⚡ ACTIVITY DETECTED] Pergerakan di dompet: ${walletAddress}`);
        
        // CATATAN: Di Phase 4, di sini kita akan memanggil fungsi untuk mengekstrak token apa yang dibeli.
        // Untuk sekarang, kita hanya mencetak log.
        
      }, 'confirmed');

      console.log(`[Listener] Berhasil memantau dompet: ${walletAddress}`);
    } catch (error) {
      console.error(`[Error] Alamat dompet tidak valid: ${walletAddress}`);
    }
  });
  
  console.log("========================================");
  console.log("[Engine] Bot standby menunggu transaksi...");
}