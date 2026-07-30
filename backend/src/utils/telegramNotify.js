const https = require('https');

/**
 * Envia notificaciones a un grupo de Telegram usando la API de Bots
 */
function sendTelegramMessage(text, chatId = null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_GROUP_ID;

    if (!botToken || botToken === 'MODO_DEMO_TOKEN' || !targetChatId) {
        console.log('[TELEGRAM NOTIFY DEMO] Mensaje simulado:', text);
        return Promise.resolve({ ok: true, isDemo: true });
    }

    const payload = JSON.stringify({
        chat_id: targetChatId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve({ ok: false, error: data });
                }
            });
        });

        req.on('error', (e) => {
            console.error('[TELEGRAM NOTIFY ERROR]', e.message);
            resolve({ ok: false, error: e.message });
        });

        req.write(payload);
        req.end();
    });
}

module.exports = { sendTelegramMessage };
