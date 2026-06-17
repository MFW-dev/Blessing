import TelegramBot from 'node-telegram-bot-api';
import { env } from './config.js';

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

// Memori sementara untuk menyimpan detail sinyal
const signalCache = new Map();

export async function sendSignalAlert(tokenAddress, riskScore, clusterCount) {
  const signalId = Math.random().toString(36).substring(7); // ID pendek
  const timestamp = Date.now();
  
  // Simpan data di memori
  signalCache.set(signalId, { tokenAddress, amount: 0.01, timestamp });

  const message = `🚨 **SIGNAL DETECTED** 🚨\n\n` +
                  `Token: \`${tokenAddress}\`\n` +
                  `Cluster: ${clusterCount} wallets\n` +
                  `Risk Score: ${riskScore}\n\n` +
                  `*Expired in 5 minutes*`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          // Callback data hanya berisi action dan signalId (pendek)
          { text: "🛒 BUY 0.01 SOL", callback_data: `buy_${signalId}` }
        ],
        [
          { text: "❌ IGNORE", callback_data: `ignore_${signalId}` }
        ]
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
    if (now - signalData.timestamp > 300000) {
      signalCache.delete(signalId);
      return bot.answerCallbackQuery(query.id, { text: "❌ Sinyal Expired!", show_alert: true });
    }
    
    bot.sendMessage(env.TELEGRAM_CHAT_ID, `⏳ Eksekusi BUY ${signalData.amount} SOL untuk \`${signalData.tokenAddress}\`...`, { parse_mode: 'Markdown' });
  }

  bot.answerCallbackQuery(query.id);
});