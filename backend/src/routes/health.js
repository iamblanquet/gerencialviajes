const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/health', (req, res) => {
    try {
        const result = db.prepare('SELECT 1 as alive').get();
        return res.json({
            status: 'UP',
            service: 'Gerenciamiento de Viajes API',
            timestamp: new Date().toISOString(),
            database: result && result.alive === 1 ? 'OK' : 'ERROR'
        });
    } catch (err) {
        return res.status(500).json({
            status: 'DOWN',
            service: 'Gerenciamiento de Viajes API',
            timestamp: new Date().toISOString(),
            database: 'ERROR',
            error: err.message
        });
    }
});

module.exports = router;
