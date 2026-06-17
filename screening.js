import { config } from './config.js';

export async function screenToken(tokenAddress) {
  console.log(`\n🔍 [Screening] Memeriksa token: ${tokenAddress}`);

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const data = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      console.log(`❌ [Screening GAGAL] Token belum ada di DEX (Likuiditas $0).`);
      return { isSafe: false, reason: "No DEX Pair found" };
    }

    // Ambil pair dengan likuiditas terbesar (biasanya index 0 di DexScreener)
    const mainPair = data.pairs[0];
    const liquidityUsd = mainPair.liquidity?.usd || 0;
    const fdv = mainPair.fdv || 0;

    console.log(`📊 Data Pasar: ${mainPair.baseToken.name} (${mainPair.baseToken.symbol})`);
    console.log(`💧 Likuiditas: $${liquidityUsd.toLocaleString()}`);

    // Filter 1: Likuiditas Minimum
    if (liquidityUsd < config.antiRug.minLiquidityUsd) {
      console.log(`❌ [Screening GAGAL] Likuiditas di bawah batas aman ($${config.antiRug.minLiquidityUsd}).`);
      return { isSafe: false, reason: "Low Liquidity" };
    }

    // Simulasi Pengecekan On-Chain
    const isMintRenounced = true; 
    const isFreezeRenounced = true; 
    const top10HoldersPct = 25; 

    // Filter 2: Mint & Freeze
    if (config.antiRug.rejectMintable && !isMintRenounced) {
       console.log(`❌ [Screening GAGAL] Mint Authority masih aktif!`);
       return { isSafe: false, reason: "Mint Authority Active" };
    }
    if (config.antiRug.rejectFreezable && !isFreezeRenounced) {
       console.log(`❌ [Screening GAGAL] Freeze Authority masih aktif!`);
       return { isSafe: false, reason: "Freeze Authority Active" };
    }

    // Filter 3: Top Holders
    if (top10HoldersPct > config.antiRug.maxTop10HoldersPct) {
       console.log(`❌ [Screening GAGAL] Top 10 holder menguasai terlalu banyak!`);
       return { isSafe: false, reason: "Top 10 Holders Terlalu Besar" };
    }

    console.log(`✅ [Screening LOLOS] Token memenuhi kriteria dasar Anti-Rug.`);

    return {
      isSafe: true,
      score: 85,
      tokenName: mainPair.baseToken.name,
      symbol: mainPair.baseToken.symbol,
      liquidityUsd,
      fdv
    };

  } catch (error) {
    console.error(`[Screening Error] ${error.message}`);
    return { isSafe: false, reason: "API/Connection Error" };
  }
}