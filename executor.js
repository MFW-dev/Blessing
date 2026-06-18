import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, isLiveTrading, isPaperTrading, modeLabel, normalizeMode } from './config.js';
import { startTracking } from './tracker.js';
import { sendSellNotification } from './telegram.js';

const connection = new Connection(env.RPC_URL, { commitment: 'confirmed' });
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_BASE_URL = env.JUPITER_API_BASE_URL.replace(/\/+$/, "");

async function fetchJupiter(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (env.JUPITER_API_KEY) {
    headers["x-api-key"] = env.JUPITER_API_KEY;
  }

  let response;
  try {
    response = await fetch(`${JUPITER_BASE_URL}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(`Gagal menghubungi Jupiter API (${JUPITER_BASE_URL}): ${error.message}`);
  }

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Respons Jupiter bukan JSON (${response.status}): ${text.slice(0, 200)}`);
    }
  }

  if (!response.ok || data.error) {
    const detail = data.error || data.message || text || response.statusText;
    throw new Error(`Jupiter API ${response.status}: ${detail}`);
  }

  return data;
}

function buildQuotePath(inputMint, outputMint, amount) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: "1000",
    restrictIntermediateTokens: "true"
  });

  return `/quote?${params.toString()}`;
}

// ==========================================
// 🛒 MESIN PEMBELI (BUY)
// ==========================================
export async function executeSwap(tokenAddress, amountSol) {
  const engineMode = normalizeMode();

  console.log(`\n⚙️ [Executor] Memulai proses eksekusi BUY untuk token: ${tokenAddress}`);
  
  if (isPaperTrading(engineMode)) {
    console.log(`📝 [Paper Trading] Simulasi pembelian ${amountSol} SOL berhasil.`);
    await new Promise(resolve => setTimeout(resolve, 2000)); 

    // Mulai mata-mata harga
    startTracking(tokenAddress, engineMode, async (addr, reason, pnl, mode, fraction) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode, fraction);
    });

    return { success: true, txId: "SIMULASI_TX_PAPER_TRADING", mode: modeLabel(engineMode) };
  }

  if (!isLiveTrading(engineMode)) {
    return { success: false, reason: `Mode trading tidak dikenal: ${engineMode}` };
  }

  // Logika LIVE TRADING (Buy)
  if (!env.SOLANA_PRIVATE_KEY) return { success: false, reason: "Private Key Kosong" };

  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    const amountLamports = Math.floor(amountSol * 1e9); 

    console.log(`🔄 [Executor] Meminta rute harga terbaik dari Jupiter...`);
    const quoteResponse = await fetchJupiter(buildQuotePath(SOL_MINT, tokenAddress, amountLamports));

    console.log(`📝 [Executor] Menyusun draf transaksi swap...`);
    const swapResponse = await fetchJupiter('/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        quoteResponse, 
        userPublicKey: wallet.publicKey.toString(), 
        wrapAndUnwrapSol: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: "veryHigh"
          }
        },
        dynamicComputeUnitLimit: true      // PERBAIKAN: Limit komputasi dinamis
      })
    });

    console.log(`✍️ [Executor] Menandatangani transaksi...`);
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    console.log(`🚀 [Executor] Mengirim transaksi ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 2 });
    console.log(`✅ [Executor] Pembelian Sukses! Signature: ${txId}`);

    // Mulai mata-mata harga setelah live buy sukses
    startTracking(tokenAddress, engineMode, async (addr, reason, pnl, mode, fraction) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode, fraction);
    });

    return { success: true, txId: txId, mode: modeLabel(engineMode) };

  } catch (error) {
    console.error(`❌ [Executor Error] ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// ==========================================
// 📉 MESIN PENJUAL (AUTO-SELL & PANIC)
// ==========================================
export async function executeSell(tokenAddress, reason, pnl, mode, sellFraction = 1.0) {
  const engineMode = normalizeMode(mode);

  if (isPaperTrading(engineMode)) {
    console.log(`📝 [Paper Trading] Simulasi penjualan ${sellFraction * 100}% token berhasil.`);
    await sendSellNotification(tokenAddress, reason, pnl, modeLabel(engineMode), "SIMULASI_TX_SELL_PAPER");
    return;
  }

  if (!isLiveTrading(engineMode)) {
    await sendSellNotification(tokenAddress, `GAGAL JUAL: Mode trading tidak dikenal: ${engineMode}`, pnl, modeLabel(engineMode), "FAILED");
    return;
  }

  // Logika LIVE TRADING (Sell)
  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    console.log(`🔍 [Executor] Mengecek saldo token di dompet...`);
    
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(tokenAddress) });
    if (tokenAccounts.value.length === 0) throw new Error("Saldo token tidak ditemukan di dompet.");
    
    const totalBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
    if (totalBalance === "0") throw new Error("Saldo token kosong.");

    const amountToSell = Math.floor(parseInt(totalBalance) * sellFraction).toString();

    console.log(`🔄 [Executor] Meminta rute jual ${sellFraction * 100}% ke Jupiter...`);
    const quoteResponse = await fetchJupiter(buildQuotePath(tokenAddress, SOL_MINT, amountToSell));

    const swapResponse = await fetchJupiter('/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        quoteResponse, 
        userPublicKey: wallet.publicKey.toString(), 
        wrapAndUnwrapSol: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: "veryHigh"
          }
        },
        dynamicComputeUnitLimit: true      // PERBAIKAN: Limit komputasi dinamis
      })
    });

    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    console.log(`🚀 [Executor] Mengirim transaksi JUAL ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    
    console.log(`✅ [Executor] Penjualan Sukses! Signature: ${txId}`);
    
    await sendSellNotification(tokenAddress, reason, pnl, modeLabel(engineMode), txId);

  } catch (error) {
    console.error(`❌ [Executor Sell Error] ${error.message}`);
    await sendSellNotification(tokenAddress, `GAGAL JUAL: ${error.message}`, pnl, modeLabel(engineMode), "FAILED");
  }
}
