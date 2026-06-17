import { config } from './config.js';

const activePositions = new Map();

async function getTokenPrice(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const data = await response.json();
    
    if (!data || !data.pairs || data.pairs.length === 0) {
      return null;
    }

    return parseFloat(data.pairs[0].priceUsd);
  } catch (error) {
    console.error(`[Tracker Error] Gagal fetch harga: ${error.message}`);
    return null;
  }
}

export async function startTracking(tokenAddress, mode, onSellSignal) {
  console.log(`\n👀 [Tracker] Mulai memantau pergerakan harga untuk: ${tokenAddress}`);
  
  const initialPrice = await getTokenPrice(tokenAddress);
  if (!initialPrice) {
    console.log(`⚠️ [Tracker] Gagal mendapatkan harga awal, pemantauan dibatalkan.`);
    return;
  }

  console.log(`💲 [Tracker] Harga Beli (Entry): $${initialPrice.toFixed(8)}`);

  // Menambahkan properti hasTakenProfit agar tidak melakukan TP berulang-ulang
  activePositions.set(tokenAddress, {
    buyPrice: initialPrice,
    mode: mode,
    startTime: Date.now(),
    hasTakenProfit: false
  });

  const intervalId = setInterval(async () => {
    const position = activePositions.get(tokenAddress);
    if (!position) {
      clearInterval(intervalId);
      return;
    }

    const currentPrice = await getTokenPrice(tokenAddress);
    if (!currentPrice) return;

    const pnlPercentage = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;
    
    console.log(`📊 [Tracker] PnL: ${pnlPercentage > 0 ? '+' : ''}${pnlPercentage.toFixed(2)}% (Harga: $${currentPrice.toFixed(8)})`);

    // LOGIKA AUTO-SELL BARU
    if (pnlPercentage >= config.trading.autoTakeProfitPct && !position.hasTakenProfit) {
      // Skenario 1: Sentuh Take Profit (30%)
      console.log(`\n🎯 [Tracker] Take Profit 30% TerCapai! Amankan Modal...`);
      position.hasTakenProfit = true; // Tandai sudah profit taking
      
      // Kirim sinyal jual 50% (0.5), JANGAN di-clearInterval (Biarkan sisa token dipantau)
      if (onSellSignal) {
        onSellSignal(tokenAddress, `🎯 Amankan Modal (+${pnlPercentage.toFixed(2)}%)`, pnlPercentage, mode, 0.5);
      }

    } else if (pnlPercentage <= -config.trading.autoStopLossPct) {
      // Skenario 2: Sentuh Stop Loss (-20%)
      console.log(`\n🚨 [Tracker] Stop Loss Terkena! Cut loss semua token...`);
      clearInterval(intervalId); // Hentikan pemantauan karena token habis
      activePositions.delete(tokenAddress);
      
      // Kirim sinyal jual 100% (1.0)
      if (onSellSignal) {
        onSellSignal(tokenAddress, `🛑 Stop Loss (${pnlPercentage.toFixed(2)}%)`, pnlPercentage, mode, 1.0);
      }
    }

  }, 30000); // Cek tiap 30 detik
}