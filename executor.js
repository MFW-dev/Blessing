import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, config } from './config.js';
import { startTracking } from './tracker.js';
import { sendSellNotification } from './telegram.js'; // ⬅️ Mengambil fungsi struk Telegram

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
    startTracking(tokenAddress, config.mode, async (addr, reason, pnl, mode) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode);
    });

    return { success: true, txId: "SIMULASI_TX_PAPER_TRADING", mode: "paper" };
  }

  // Logika LIVE TRADING (Buy)
  if (!env.SOLANA_PRIVATE_KEY) return { success: false, reason: "Private Key Kosong" };

  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    const amountLamports = Math.floor(amountSol * 1e9); 

    console.log(`🔄 [Executor] Meminta rute harga terbaik dari Jupiter...`);
    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=200`).then(res => res.json());
    if (quoteResponse.error) throw new Error(quoteResponse.error);

    console.log(`📝 [Executor] Menyusun draf transaksi swap...`);
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteResponse, userPublicKey: wallet.publicKey.toString(), wrapAndUnwrapSol: true })
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
    startTracking(tokenAddress, config.mode, async (addr, reason, pnl, mode) => {
      console.log(`\n🤖 [Tracker - ${mode.toUpperCase()}] Sinyal Jual! Eksekusi SELL otomatis...`);
      await executeSell(addr, reason, pnl, mode);
    });

    return { success: true, txId: txId, mode: "live" };

  } catch (error) {
    console.error(`❌ [Executor Error] ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// ==========================================
// 📉 MESIN PENJUAL (AUTO-SELL)
// ==========================================
export async function executeSell(tokenAddress, reason, pnl, mode) {
  if (mode === "paper_trading") {
    console.log(`📝 [Paper Trading] Simulasi penjualan 100% token berhasil.`);
    // Kirim notifikasi struk ke Telegram
    await sendSellNotification(tokenAddress, reason, pnl, mode, "SIMULASI_TX_SELL_PAPER");
    return;
  }

  // Logika LIVE TRADING (Sell)
  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    console.log(`🔍 [Executor] Mengecek saldo token di dompet...`);
    
    // Cari akun token khusus untuk token ini di dompet Anda
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(tokenAddress) });
    
    if (tokenAccounts.value.length === 0) throw new Error("Saldo token tidak ditemukan di dompet.");
    
    // Ambil jumlah pasti dari token yang dimiliki
    const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
    if (tokenBalance === "0") throw new Error("Saldo token kosong.");

    console.log(`🔄 [Executor] Meminta rute jual (Token -> SOL) ke Jupiter...`);
    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${tokenAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${tokenBalance}&slippageBps=300`).then(res => res.json());
    if (quoteResponse.error) throw new Error(quoteResponse.error);

    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteResponse, userPublicKey: wallet.publicKey.toString(), wrapAndUnwrapSol: true })
    }).then(res => res.json());
    if (swapResponse.error) throw new Error(swapResponse.error);

    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    console.log(`🚀 [Executor] Mengirim transaksi JUAL ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    
    console.log(`✅ [Executor] Penjualan Sukses! Signature: ${txId}`);
    
    // Kirim notifikasi struk ke Telegram
    await sendSellNotification(tokenAddress, reason, pnl, mode, txId);

  } catch (error) {
    console.error(`❌ [Executor Sell Error] ${error.message}`);
    // Kirim peringatan gagal jual ke Telegram
    await sendSellNotification(tokenAddress, `GAGAL JUAL: ${error.message}`, pnl, mode, "FAILED");
  }
}