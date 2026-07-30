const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const healthRoutes = require('./routes/health');
const catalogosRoutes = require('./routes/catalogos');
const telegramRoutes = require('./routes/telegram');
const viajesRoutes = require('./routes/viajes');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS para solicitudes desde frontend y panel admin
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Registrar rutas
app.use('/', healthRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/viajes', viajesRoutes);
app.use('/api/admin', adminRoutes);

// Manejador 404 Not Found
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
    });
});

// Manejador de errores global con respuesta estandarizada
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    return res.status(500).json({
        success: false,
        message: err.message || 'Error interno del servidor'
    });
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 API Gerenciamiento de Viajes corriendo en puerto ${PORT}`);
    console.log(`📍 Endpoint de salud: http://localhost:${PORT}/health`);
    console.log(`====================================================`);
});
