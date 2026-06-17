import TelegramBot from 'node-telegram-bot-api';
import { env, config, saveConfig } from './config.js';
import { addWalletListener, removeWalletListener } from './listener.js';

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
const signalCache = new Map();

// Fungsi Alert (Tidak diubah)
export async function sendSignalAlert(tokenAddress, riskScore, clusterCount) {
  const signalId = Math.random().toString(36).substring(7);
  const timestamp = Date.now();
  
  signalCache.set(signalId, { tokenAddress, amount: 0.01, timestamp });

  const message = `🚨 **SIGNAL DETECTED** 🚨\n\n` +
                  `Token: \`${tokenAddress}\`\n` +
                  `Risk Score: ${riskScore}\n\n` +
                  `*Expired in 5 minutes*`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 BUY 0.01 SOL", callback_data: `buy_${signalId}` }],
        [{ text: "❌ IGNORE", callback_data: `ignore_${signalId}` }]
      ]
    }
  };
  await bot.sendMessage(env.TELEGRAM_CHAT_ID, message, options);
}

// Handler Tombol (Tidak diubah)
bot.on('callback_query', async (query) => {
  const [action, signalId] = query.data.split('_');
  const signalData = signalCache.get(signalId);

  if (!signalData) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Sinyal tidak ditemukan/expired!", show_alert: true });
  }

  const now = Date.now();
  if (action === 'buy') {
    if (now - signalData.timestamp > 300000) {
      signalCache.delete(signalId);
      return bot.answerCallbackQuery(query.id, { text: "❌ Sinyal Expired!", show_alert: true });
    }
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `⏳ Eksekusi BUY ${signalData.amount} SOL untuk \`${signalData.tokenAddress}\`...`, { parse_mode: 'Markdown' });
  }
  bot.answerCallbackQuery(query.id);
});

// ==========================================
// 🛠️ FITUR ADMIN COMMAND (BARU)
// ==========================================

// 1. Tambah Wallet
bot.onText(/\/add (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return; // Keamanan: Hanya Anda yang bisa perintahkan bot
  
  const newWallet = match[1].trim();
  if (!config.smartWallet.targetWallets.includes(newWallet)) {
    config.smartWallet.targetWallets.push(newWallet);
    saveConfig(); // Simpan ke file permanen
    addWalletListener(newWallet); // Langsung pantau tanpa restart
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `✅ Wallet berhasil ditambahkan & dipantau:\n\`${newWallet}\``, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `⚠️ Wallet sudah ada di daftar pantauan.`);
  }
});

// 2. Hapus Wallet
bot.onText(/\/remove (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== env.TELEGRAM_CHAT_ID) return;
  
  const walletToRemove = match[1].trim();
  const index = config.smartWallet.targetWallets.indexOf(walletToRemove);
  
  if (index !== -1) {
    config.smartWallet.targetWallets.splice(index, 1);
    saveConfig(); // Simpan penghapusan ke file
    removeWalletListener(walletToRemove); // Copot pantauan Helius
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `🗑️ Wallet berhasil dihapus dari pantauan:\n\`${walletToRemove}\``, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `❌ Wallet tidak ditemukan di daftar pantauan.`);
  }
});

// 3. Lihat Daftar Wallet
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