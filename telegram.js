import TelegramBot from 'node-telegram-bot-api';
import { env, config, saveConfig } from './config.js';
import { addWalletListener, removeWalletListener } from './listener.js';
import { executeSwap, executeSell } from './executor.js'; 

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
const signalCache = new Map();

// ==========================================
// 🚨 FUNGSI ALERT & CALLBACK KOMBOL BELI
// ==========================================
export async function sendSignalAlert(tokenAddress, riskScore, clusterCount) {
  const signalId = Math.random().toString(36).substring(7);
  const timestamp = Date.now();
  
  // PERBAIKAN: Mengambil jumlah SOL dari config, bukan di-hardcode
  const buyAmount = config.trading.semiAutoAmountSol;
  
  signalCache.set(signalId, { tokenAddress, amount: buyAmount, timestamp });

  const message = `🚨 **SIGNAL DETECTED** 🚨\n\n` +
                  `Token: \`${tokenAddress}\`\n` +
                  `Risk Score: ${riskScore}\n\n` +
                  `*Expired in 5 minutes*`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        // PERBAIKAN: Teks tombol otomatis mengikuti jumlah di config
        [{ text: `🛒 BUY ${buyAmount} SOL`, callback_data: `buy_${signalId}` }],
        [{ text: "❌ IGNORE", callback_data: `ignore_${signalId}` }]
      ]
    }
  };
  await bot.sendMessage(env.TELEGRAM_CHAT_ID, message, options);
}

bot.on('callback_query', async (query) => {
  const [action, signalId] = query.data.split('_');
  const signalData = signalCache.get(signalId);

  if (!signalData) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Sinyal tidak ditemukan/expired!", show_alert: true });
  }

  const now = Date.now();

  if (action === 'buy') {
    if (now - signalData.timestamp > 300000) { // 5 menit expired
      signalCache.delete(signalId);
      return bot.answerCallbackQuery(query.id, { text: "❌ Sinyal Expired!", show_alert: true });
    }
    
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `⏳ Mengeksekusi BUY ${signalData.amount} SOL untuk token:\n\`${signalData.tokenAddress}\`...`, { parse_mode: 'Markdown' });
    
    const result = await executeSwap(signalData.tokenAddress, signalData.amount);
    
    if (result.success) {
      const modeText = result.mode === 'paper' ? '🟢 **[PAPER TRADING]** ' : '🔥 **[LIVE TRADING]** ';
      bot.sendMessage(env.TELEGRAM_CHAT_ID, `${modeText}Pembelian Berhasil!\n\n🔗 **TX ID:** \`${result.txId}\``, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(env.TELEGRAM_CHAT_ID, `❌ **PEMBELIAN GAGAL!**\nAlasan: ${result.reason}`, { parse_mode: 'Markdown' });
    }
  }

  if (action === 'ignore') {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `🗑️ Token \`${signalData.tokenAddress}\` diabaikan.`, { parse_mode: 'Markdown' });
    signalCache.delete(signalId); 
  }

  bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ FITUR ADMIN COMMAND
// ==========================================

bot.onText(/\/add (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return; 
  
  const newWallet = match[1].trim();
  if (!config.smartWallet.targetWallets.includes(newWallet)) {
    config.smartWallet.targetWallets.push(newWallet);
    saveConfig(); 
    addWalletListener(newWallet); 
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `✅ Wallet berhasil ditambahkan & dipantau:\n\`${newWallet}\``, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `⚠️ Wallet sudah ada di daftar pantauan.`);
  }
});

bot.onText(/\/remove (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return;
  
  const walletToRemove = match[1].trim();
  const index = config.smartWallet.targetWallets.indexOf(walletToRemove);
  
  if (index !== -1) {
    config.smartWallet.targetWallets.splice(index, 1);
    saveConfig(); 
    removeWalletListener(walletToRemove); 
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `🗑️ Wallet berhasil dihapus dari pantauan:\n\`${walletToRemove}\``, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `❌ Wallet tidak ditemukan di daftar pantauan.`);
  }
});

bot.onText(/\/list/, (msg) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return;
  
  const wallets = config.smartWallet.targetWallets;
  if (wallets.length === 0) {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, "📭 Daftar pantauan kosong.");
  } else {
    let text = `📋 **Daftar ${wallets.length} Target Wallet:**\n\n`;
    wallets.forEach((w, i) => {
      text += `${i + 1}. \`${w}\`\n`;
    });
    bot.sendMessage(env.TELEGRAM_CHAT_ID, text, { parse_mode: "Markdown" });
  }
});

// ==========================================
// 🚨 PANIC BUTTON (Jual Paksa 100%)
// ==========================================
bot.onText(/\/panic (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return;
  
  const tokenToSell = match[1].trim();
  bot.sendMessage(env.TELEGRAM_CHAT_ID, `🚨 **PANIC BUTTON AKTIF!**\nMengeksekusi penjualan 100% paksa untuk:\n\`${tokenToSell}\``, { parse_mode: "Markdown" });
  
  // Panggil executeSell dengan parameter fraction 1.0 (100%)
  await executeSell(tokenToSell, "🚨 PANIC SELL MANUAL", 0, config.mode, 1.0);
});

// ==========================================
// 📩 NOTIFIKASI HASIL PENJUALAN
// ==========================================
export async function sendSellNotification(tokenAddress, reason, pnl, mode, txId) {
  const pnlText = pnl > 0 ? `🟢 Untung: +${pnl.toFixed(2)}%` : `🔴 Rugi/Manual: ${pnl.toFixed(2)}%`;
  const modeText = mode === 'paper' ? '🟢 **[PAPER TRADING]** ' : '🔥 **[LIVE TRADING]** ';

  const message = `${modeText} **SELL EXECUTED!** 🚨\n\n` +
                  `Token: \`${tokenAddress}\`\n` +
                  `Status: ${pnlText}\n` +
                  `Alasan: ${reason}\n\n` +
                  `🔗 **TX ID:** \`${txId}\``;

  await bot.sendMessage(env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
}