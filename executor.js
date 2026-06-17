import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, config } from './config.js';

const connection = new Connection(env.RPC_URL, { commitment: 'confirmed' });

export async function executeSwap(tokenAddress, amountSol) {
  console.log(`\n⚙️ [Executor] Memulai proses eksekusi BUY untuk token: ${tokenAddress}`);
  
  // 1. Cek Mode Trading (Paper Trading vs Live)
  if (config.mode === "paper_trading") {
    console.log(`📝 [Paper Trading] Simulasi pembelian ${amountSol} SOL berhasil.`);
    // Jeda buatan agar terasa seperti transaksi nyata
    await new Promise(resolve => setTimeout(resolve, 2000)); 
    return { success: true, txId: "SIMULASI_TX_PAPER_TRADING", mode: "paper" };
  }

  // 2. LIVE TRADING: Validasi Private Key
  if (!env.SOLANA_PRIVATE_KEY) {
    console.log(`❌ [Executor] Private Key tidak ditemukan di .env!`);
    return { success: false, reason: "Private Key Kosong" };
  }

  try {
    // Membaca dompet dari Private Key
    const wallet = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
    const amountLamports = Math.floor(amountSol * 1e9); // Konversi SOL ke angka terkecil (Lamports)

    // 3. Dapatkan Quote harga terbaik dari Jupiter API
    console.log(`🔄 [Executor] Meminta rute harga terbaik dari Jupiter...`);
    const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=200`).then(res => res.json());

    if (quoteResponse.error) throw new Error(quoteResponse.error);

    // 4. Minta draf transaksi dari Jupiter
    console.log(`📝 [Executor] Menyusun draf transaksi swap...`);
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true
      })
    }).then(res => res.json());

    if (swapResponse.error) throw new Error(swapResponse.error);

    // 5. Tanda tangani transaksi dengan dompet bot
    console.log(`✍️ [Executor] Menandatangani transaksi...`);
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    // 6. Kirim ke jaringan Solana (Helius)
    console.log(`🚀 [Executor] Mengirim transaksi ke blockchain...`);
    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true, // Bypass pre-check agar lebih cepat
      maxRetries: 2
    });

    console.log(`✅ [Executor] Transaksi Sukses! Signature: ${txId}`);
    return { success: true, txId: txId, mode: "live" };

  } catch (error) {
    console.error(`❌ [Executor Error] ${error.message}`);
    return { success: false, reason: error.message };
  }
}