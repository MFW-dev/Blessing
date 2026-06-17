import { config } from './config.js';

// Menyimpan daftar token yang sedang dipantau
const activePositions = new Map();

// Mengambil harga token saat ini menggunakan Jupiter Price API v2
async function getTokenPrice(tokenAddress) {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddress}`);
    const data = await response.json();
    return data.data[tokenAddress]?.price ? parseFloat(data.data[tokenAddress].price) : null;
  } catch (error) {
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

  console.log(`💲 [Tracker] Harga Beli (Entry): $${initialPrice.toFixed(6)}`);

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
    
    // Log senyap di terminal (bisa dihapus nanti jika terlalu ramai)
    console.log(`📊 [Tracker] ${tokenAddress.slice(0,4)}... PnL saat ini: ${pnlPercentage > 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%`);

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
      clearInterval(intervalId);
      activePositions.delete(tokenAddress);
      
      // Kirim perintah jual ke file telegram.js / executor.js
      if (onSellSignal) {
        onSellSignal(tokenAddress, reasonToSell, pnlPercentage, mode);
      }
    }

  }, 30000); // 30000 ms = 30 detik
}