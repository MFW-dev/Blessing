import { startListening } from './listener.js';
import { parseTransaction } from './parser.js';
import { screenToken } from './screening.js';
import { analyzeTokenWithLLM } from './llm.js';
import { sendSignalAlert } from './telegram.js';

console.log("=== Blessing Bot Engine Aktif ===");

/**
 * JANTUNG BOT: Dipanggil otomatis tiap kali dompet target melakukan transaksi di Solana
 */
async function processLiveTransaction(walletAddress, signature) {
  // 1. Bedah Transaksi (Cari tahu token apa yang dibeli)
  const tokenAddress = await parseTransaction(signature, walletAddress);
  
  // Jika bukan transaksi SWAP atau token tidak ditemukan, abaikan.
  if (!tokenAddress) return; 
  
  console.log(`🚀 [TARGET FOUND] Whale membeli token: ${tokenAddress}`);

  // 2. Screening Dasar (DexScreener & On-chain)
  const screenResult = await screenToken(tokenAddress);
  if (!screenResult.isSafe) {
    console.log(`⛔ [Ditolak] Token dibuang: ${screenResult.reason}`);
    return;
  }

  // 3. Analisis AI DeepSeek
  const aiAnalysis = await analyzeTokenWithLLM(screenResult);
  if (aiAnalysis.score < 50) {
    console.log(`⛔ [Ditolak AI] Skor terlalu rendah (${aiAnalysis.score}). Terindikasi Rugpull.`);
    return;
  }

  // 4. Kirim Alert ke Telegram!
  const finalScoreText = `${aiAnalysis.score}/100 - ${aiAnalysis.reason}`;
  await sendSignalAlert(tokenAddress, finalScoreText, 1);
  
  console.log(`✅ [Terkirim] Sinyal potensial berhasil dikirim ke Telegram Anda!`);
}

// Nyalakan bot dan berikan fungsi processLiveTransaction sebagai penerima data
startListening(processLiveTransaction);