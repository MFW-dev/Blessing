import { screenToken } from './screening.js';
import { analyzeTokenWithLLM } from './llm.js';
import { sendSignalAlert } from './telegram.js'; // ⬅️ Tambahan untuk tes Telegram

async function runTest() {
  console.log("=== Menguji Pipeline: Screening + LLM + TELEGRAM ===");
  
  // Kita gunakan BONK lagi untuk uji coba
  const tokenAddress = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  
  // 1. Jalankan Screening Dasar
  const screenResult = await screenToken(tokenAddress);

  // 2. Jika Lolos, Minta Opini AI DeepSeek
  if (screenResult.isSafe) {
    const aiAnalysis = await analyzeTokenWithLLM(screenResult);
    
    console.log("\n=================================");
    console.log("🏆 KESIMPULAN AKHIR TOKEN");
    console.log("Skor AI    :", aiAnalysis.score, "/ 100");
    console.log("=================================\n");

    // 3. ⬅️ KIRIM KE TELEGRAM UNTUK TES TOMBOL BUY
    console.log("Mengirim pesan alert ke Telegram...");
    const finalScoreText = `${aiAnalysis.score}/100 - ${aiAnalysis.reason}`;
    await sendSignalAlert(tokenAddress, finalScoreText, 1);
    
    console.log("✅ Pesan terkirim! Silakan buka Telegram Anda dan klik tombol BUY.");

  } else {
    console.log(`\n⛔ Eksekusi dihentikan. Token dibuang karena: ${screenResult.reason}`);
  }
}

runTest();