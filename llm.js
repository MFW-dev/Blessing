import { env } from './config.js';

export async function analyzeTokenWithLLM(tokenData) {
  console.log(`\n🧠 [LLM] Meminta opini DeepSeek untuk: ${tokenData.tokenName} (${tokenData.symbol})...`);

  if (!env.OPENROUTER_API_KEY) {
    console.log(`⚠️ [LLM Peringatan] OPENROUTER_API_KEY tidak ditemukan di .env. AI dilewati.`);
    return { score: tokenData.score, reason: "Tidak ada analisa AI (API Key kosong)" };
  }

  const prompt = `
    Anda adalah "Anti-Rug Smart Bot", asisten pakar crypto di jaringan Solana.
    Tugas Anda adalah menganalisis data token berikut dan memberikan skor keamanan (0-100) serta 1 kalimat alasan singkat.
    Skor < 50 = Sangat Bahaya (Indikasi Rugpull), Skor 50-70 = Berisiko, Skor > 70 = Cukup Aman.

    Data Token:
    Nama: ${tokenData.tokenName}
    Simbol: ${tokenData.symbol}
    Likuiditas DEX: $${tokenData.liquidityUsd.toLocaleString()}
    FDV (Market Cap): $${tokenData.fdv.toLocaleString()}

    Berikan jawaban HANYA dalam format JSON valid yang berisi atribut "score" (angka) dan "reason" (string). Contoh:
    {"score": 85, "reason": "Likuiditas sangat sehat dan nama token terlihat seperti proyek organik."}
  `;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        // Catatan: response_format dihapus karena tidak semua model OpenRouter mendukungnya, 
        // kita paksa via prompt saja agar lebih aman.
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    
    // 1. Tangkap error spesifik dari server OpenRouter (jika ada)
    if (data.error) {
      console.error(`❌ [OpenRouter API Error] ${data.error.message}`);
      throw new Error(data.error.message);
    }

    let resultText = data.choices[0].message.content;
    
    // 2. Pembersihan teks (Menghapus blok ```json yang kadang ditambahkan AI)
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const resultJson = JSON.parse(resultText);

    console.log(`✅ [LLM Selesai] Skor AI: ${resultJson.score}/100 - ${resultJson.reason}`);
    return resultJson;

  } catch (error) {
    console.error(`❌ [LLM Error] Gagal menganalisis dengan AI: ${error.message}`);
    // Fallback: kembalikan skor dasar jika AI gagal
    return { score: tokenData.score, reason: "Gagal memuat analisis AI" };
  }
}