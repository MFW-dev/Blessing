import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, config } from './config.js';
import { startTracking } from './tracker.js';
import { sendSellNotification } from './telegram.js';

const connection = new Connection(env.RPC_URL, { commitment: 'confirmed' });

// ==========================================
// 🛒 MESIN PEMBELI (BUY)
// ==========================================
export async function executeSwap(tokenAddress, amountSol) {
  console.log(`\n⚙️ [Executor] Memulai proses eksekusi BUY untuk token: ${tokenAddress}`);
  
  if (config.mode === "paper_trading") {
    console.log(`📝 [Paper Trading] Simulasi pembelian ${amountSol} SOL berhasil.`);
    await new Promise(resolve => setTimeout(resolve, 2000)); 

    // Mulai mata-mata harga
    startTracking(tokenAddress, config.mode, async (addr, reason, pnl, mode, fraction) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode, fraction);
    });

    return { success: true, txId: "SIMULASI_TX_PAPER_TRADING", mode: "paper" };
  }

  // Logika LIVE TRADING (Buy)
  if (!env.SOLANA_PRIVATE_KEY) return { success: false, reason: "Private Key Kosong" };

  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    const amountLamports = Math.floor(amountSol * 1e9); 

    console.log(`🔄 [Executor] Meminta rute harga terbaik dari Jupiter...`);
    // PERBAIKAN: slippageBps = 1000 (10%)
    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=1000`).then(res => res.json());
    if (quoteResponse.error) throw new Error(quoteResponse.error);

    console.log(`📝 [Executor] Menyusun draf transaksi swap...`);
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        quoteResponse, 
        userPublicKey: wallet.publicKey.toString(), 
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: "auto", // PERBAIKAN: Priority Fee Auto
        dynamicComputeUnitLimit: true      // PERBAIKAN: Limit komputasi dinamis
      })
    }).then(res => res.json());
    if (swapResponse.error) throw new Error(swapResponse.error);

    console.log(`✍️ [Executor] Menandatangani transaksi...`);
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    console.log(`🚀 [Executor] Mengirim transaksi ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 2 });
    console.log(`✅ [Executor] Pembelian Sukses! Signature: ${txId}`);

    // Mulai mata-mata harga setelah live buy sukses
    startTracking(tokenAddress, config.mode, async (addr, reason, pnl, mode, fraction) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode, fraction);
    });

    return { success: true, txId: txId, mode: "live" };

  } catch (error) {
    console.error(`❌ [Executor Error] ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// ==========================================
// 📉 MESIN PENJUAL (AUTO-SELL & PANIC)
// ==========================================
export async function executeSell(tokenAddress, reason, pnl, mode, sellFraction = 1.0) {
  if (mode === "paper_trading") {
    console.log(`📝 [Paper Trading] Simulasi penjualan ${sellFraction * 100}% token berhasil.`);
    await sendSellNotification(tokenAddress, reason, pnl, mode, "SIMULASI_TX_SELL_PAPER");
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
    // PERBAIKAN: slippageBps = 1000 (10%)
    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${tokenAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${amountToSell}&slippageBps=1000`).then(res => res.json());
    if (quoteResponse.error) throw new Error(quoteResponse.error);

    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        quoteResponse, 
        userPublicKey: wallet.publicKey.toString(), 
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: "auto", // PERBAIKAN: Priority Fee Auto
        dynamicComputeUnitLimit: true      // PERBAIKAN: Limit komputasi dinamis
      })
    }).then(res => res.json());
    if (swapResponse.error) throw new Error(swapResponse.error);

    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    console.log(`🚀 [Executor] Mengirim transaksi JUAL ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    
    console.log(`✅ [Executor] Penjualan Sukses! Signature: ${txId}`);
    
    await sendSellNotification(tokenAddress, reason, pnl, mode, txId);

  } catch (error) {
    console.error(`❌ [Executor Sell Error] ${error.message}`);
    await sendSellNotification(tokenAddress, `GAGAL JUAL: ${error.message}`, pnl, mode, "FAILED");
  }
}