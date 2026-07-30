const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'gerenciamiento_viajes_jwt_secret_key_2026';
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'admin_session_token';

function requireAdminAuth(req, res, next) {
    let token = req.cookies ? req.cookies[ADMIN_COOKIE_NAME] : null;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Sesión no iniciada o token de autenticación no proporcionado'
        });
    }

    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        req.adminUser = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Sesión expirada o inválida. Por favor inicie sesión nuevamente.'
        });
    }
}

module.exports = { requireAdminAuth };
