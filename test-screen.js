import { screenToken } from './screening.js';
import { analyzeTokenWithLLM } from './llm.js';

async function runTest() {
  console.log("=== Menguji Pipeline: Screening + LLM DeepSeek ===");
  
  // Kita gunakan BONK lagi untuk uji coba
  const tokenAddress = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  
  // 1. Jalankan Screening Dasar (DexScreener)
  const screenResult = await screenToken(tokenAddress);

  // 2. Jika Lolos, Minta Opini AI DeepSeek
  if (screenResult.isSafe) {
    const aiAnalysis = await analyzeTokenWithLLM(screenResult);
    
    // Cetak Kesimpulan Akhir
    console.log("\n=================================");
    console.log("🏆 KESIMPULAN AKHIR TOKEN");
    console.log("Nama Token :", screenResult.tokenName);
    console.log("Status     : LOLOS FILTER DEX");
    console.log("Skor AI    :", aiAnalysis.score, "/ 100");
    console.log("Alasan AI  :", aiAnalysis.reason);
    console.log("=================================\n");
  } else {
    console.log(`\n⛔ Eksekusi dihentikan. Token dibuang karena: ${screenResult.reason}`);
  }
}

runTest();