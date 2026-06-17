import { config } from './config.js';

// Menyimpan daftar token yang sedang dipantau
const activePositions = new Map();

// Mengambil harga token saat ini menggunakan DexScreener API (Terbukti kebal blokir)
async function getTokenPrice(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const data = await response.json();
    
    // Validasi format jawaban API DexScreener
    if (!data || !data.pairs || data.pairs.length === 0) {
      console.log(`[Debug] API DexScreener tidak menemukan harga untuk: ${tokenAddress}`);
      return null;
    }

    // Ambil harga (dalam USD) dari pair dengan likuiditas terbesar (index 0)
    return parseFloat(data.pairs[0].priceUsd);
  } catch (error) {
    console.error(`[Tracker Error] Gagal fetch harga: ${error.message}`);
    return null;
  }
}

// Memulai pemantauan token baru
export async function startTracking(tokenAddress, mode, onSellSignal) {
  console.log(`\n👀 [Tracker] Mulai memantau pergerakan harga untuk: ${tokenAddress}`);
  
  // Ambil harga awal (Harga Beli)
  const initialPrice = await getTokenPrice(tokenAddress);
  if (!initialPrice) {
    console.log(`⚠️ [Tracker] Gagal mendapatkan harga awal, pemantauan dibatalkan.`);
    return;
  }

  console.log(`💲 [Tracker] Harga Beli (Entry): $${initialPrice.toFixed(8)}`);

  // Simpan data posisi
  activePositions.set(tokenAddress, {
    buyPrice: initialPrice,
    mode: mode,
    startTime: Date.now()
  });

  // Interval Pengecekan (Setiap 30 Detik)
  const intervalId = setInterval(async () => {
    const position = activePositions.get(tokenAddress);
    if (!position) {
      clearInterval(intervalId);
      return;
    }

    const currentPrice = await getTokenPrice(tokenAddress);
    if (!currentPrice) return;

    // Hitung persentase Keuntungan/Kerugian (PnL)
    const pnlPercentage = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;
    
    // Log di terminal
    console.log(`📊 [Tracker] PnL saat ini: ${pnlPercentage > 0 ? '+' : ''}${pnlPercentage.toFixed(2)}% (Harga: $${currentPrice.toFixed(8)})`);

    // CEK KONDISI JUAL (TAKE PROFIT ATAU STOP LOSS)
    let reasonToSell = null;
    
    if (pnlPercentage >= config.trading.autoTakeProfitPct) {
      reasonToSell = `🎯 Take Profit TerCapai (+${pnlPercentage.toFixed(2)}%)`;
    } else if (pnlPercentage <= -config.trading.autoStopLossPct) {
      reasonToSell = `🛑 Stop Loss Terkena (${pnlPercentage.toFixed(2)}%)`;
    }

    // Jika waktunya jual
    if (reasonToSell) {
      console.log(`\n🚨 [Tracker] Sinyal Jual Terpicu! Alasan: ${reasonToSell}`);
      clearInterval(intervalId); // Hentikan pemantauan
      activePositions.delete(tokenAddress);
      
      // Kirim perintah jual ke executor.js
      if (onSellSignal) {
        onSellSignal(tokenAddress, reasonToSell, pnlPercentage, mode);
      }
    }

  }, 30000); // 30 detik
}