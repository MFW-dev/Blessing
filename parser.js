import { env } from './config.js';

export async function parseTransaction(signature, walletAddress) {
  try {
    // Meminta Helius untuk membedah ID Transaksi menjadi format JSON yang mudah dibaca
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${env.HELIUS_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    });

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const tx = data[0];

    // Filter 1: Kita hanya peduli pada transaksi SWAP (Tukar/Beli/Jual)
    if (tx.type !== 'SWAP') return null;

    // Filter 2: Cari token apa yang DITERIMA (masuk) ke dompet Whale tersebut
    let tokenBought = null;
    
    for (const transfer of tx.tokenTransfers) {
      // Syarat: Penerima adalah Whale kita, DAN tokennya BUKAN SOL asli (karena kita mencari token baru/memecoin)
      if (transfer.toUserAccount === walletAddress && transfer.mint !== 'So11111111111111111111111111111111111111112') {
        tokenBought = transfer.mint;
        break; // Ditemukan! Hentikan pencarian.
      }
    }

    if (tokenBought) {
      console.log(`\n🔎 [Parser] Transaksi SWAP terdeteksi!`);
      console.log(`Signature: https://solscan.io/tx/${signature}`);
      console.log(`Token Mint: ${tokenBought}`);
      return tokenBought;
    }

    return null;

  } catch (error) {
    console.error(`[Parser Error] Gagal membedah transaksi: ${error.message}`);
    return null;
  }
}