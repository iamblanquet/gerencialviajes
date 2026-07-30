const crypto = require('crypto');

/**
 * Valida initData de Telegram Web App utilizando el token del bot.
 * Si no hay token configurado o está en modo demo/dev, procesa el payload de forma segura para permitir pruebas.
 */
function verifyTelegramInitData(initData, botToken) {
    if (!initData) {
        return { valid: false, message: 'Datos de inicio de sesión no proporcionados' };
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    const userStr = urlParams.get('user');

    if (!userStr) {
        return { valid: false, message: 'Datos de usuario no encontrados en initData' };
    }

    let user;
    try {
        user = JSON.parse(userStr);
    } catch (e) {
        return { valid: false, message: 'Formato de JSON de usuario inválido en initData' };
    }

    // Modo desarrollo / demo sin token configurado o con token por defecto
    if (!botToken || botToken === 'MODO_DEMO_TOKEN' || process.env.NODE_ENV === 'development') {
        return {
            valid: true,
            user,
            isDemo: true
        };
    }

    if (!hash) {
        return { valid: false, message: 'Hash de autenticación no proporcionado' };
    }

    urlParams.delete('hash');
    const params = [];
    for (const [key, value] of urlParams.entries()) {
        params.push(`${key}=${value}`);
    }
    params.sort();
    const dataCheckString = params.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
        return { valid: true, user };
    } else {
        return { valid: false, message: 'La firma de autenticación de Telegram es inválida' };
    }
}

module.exports = { verifyTelegramInitData };
