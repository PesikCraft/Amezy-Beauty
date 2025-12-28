const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let CHAT_ID = null;

/**
 * Инициализация бота
 */
function initTelegramBot({ token, chatId }) {
    if (!token || !chatId) {
        console.warn('⚠️ Telegram bot не инициализирован');
        return;
    }

    CHAT_ID = chatId;
    bot = new TelegramBot(token, { polling: false });
    console.log('🤖 Telegram bot подключён');
}

/**
 * Безопасный вывод товаров
 */
function formatItems(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return '—';
    }

    return items.map(i => {
        const name = i.name || i.productName || 'Товар';
        const qty = i.quantity || 1;
        return `• ${name} × ${qty}`;
    }).join('\n');
}

/**
 * Новый заказ
 */
async function sendOrderToTelegram(order) {
    if (!bot || !CHAT_ID) return;
    if (order.telegramNotified) return;

    const text =
`🛒 Новый заказ — Amezy Beauty

👤 Клиент: ${order.userEmail || '—'}
💳 Оплата: ${order.paymentMethod}
📦 Статус: ${order.status}

📍 Адрес: ${order.address || '—'}
🗺 Карта: ${
order.mapCoordinates
? `https://yandex.ru/maps/?ll=${order.mapCoordinates.split(',')[1]},${order.mapCoordinates.split(',')[0]}&z=16`
: '—'
}

🧴 Товары:
${formatItems(order.items)}

💰 Сумма: ${order.total}
🕒 ${new Date(order.createdAt || Date.now()).toLocaleString()}
`;

    try {
        await bot.sendMessage(CHAT_ID, text, {
            disable_web_page_preview: true
        });
        order.telegramNotified = true;
    } catch (e) {
        console.error('❌ Telegram error:', e.message);
    }
}

/**
 * Смена статуса
 */
async function sendOrderStatusUpdate(order) {
    if (!bot || !CHAT_ID) return;

    const statusMap = {
        pending: '⏳ Ожидает',
        processing: '🛠 В обработке',
        shipping: '🚚 В пути',
        delivered: '📦 Доставлен',
        done: '✅ Выполнен'
    };

    const text =
`📦 Статус заказа обновлён — Amezy Beauty

👤 Клиент: ${order.userEmail || '—'}
🧾 Заказ: ${order.id}
🔄 Новый статус: ${statusMap[order.status] || order.status}

📍 Адрес: ${order.address || '—'}
🕒 ${new Date().toLocaleString()}
`;

    try {
        await bot.sendMessage(CHAT_ID, text, {
            disable_web_page_preview: true
        });
    } catch (e) {
        console.error('❌ Telegram error:', e.message);
    }
}

module.exports = {
    initTelegramBot,
    sendOrderToTelegram,
    sendOrderStatusUpdate
};