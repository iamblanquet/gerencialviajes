// Configuración Global y Estado de la App
function getApiUrl() {
    if (window.location.hostname.includes('onrender.com')) {
        return 'https://gerenciamiento-viajes-backend.onrender.com/api';
    }
    return '/api';
}

const API_URL = getApiUrl();
let tg = window.Telegram?.WebApp || null;

let currentTelegramUser = null;
let currentConductor = null;
let currentActiveTrip = null;
let currentActiveStop = null;

let isGpsWatchStarted = false;
let gpsWatchId = null;
let gpsIntervalTimer = null;
let lastGpsPosition = null;
let stopTimerInterval = null;

let catalogVehicles = [];
let catalogPlaces = [];

// Helper para llamadas fetch seguras
async function safeFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`El servidor devolvió un error (${res.status}): ${text.substring(0, 100)}`);
    }
    return await res.json();
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initTelegramWebApp();
    setupEventListeners();
    setupNetworkStatusListeners();
});

function initTelegramWebApp() {
    if (tg) {
        tg.ready();
        tg.expand();
    }

    const initData = tg?.initData || '';
    
    if (initData) {
        document.getElementById('telegram-badge').textContent = 'Telegram Real';
        document.getElementById('telegram-badge').className = 'badge badge-success';
        autenticarTelegram(initData, null);
    } else {
        const savedUser = localStorage.getItem('tg_user_session');
        if (savedUser) {
            try {
                const userObj = JSON.parse(savedUser);
                autenticarTelegram(null, userObj);
                return;
            } catch (e) {}
        }
        
        document.getElementById('telegram-badge').textContent = 'Modo Web';
        document.getElementById('telegram-badge').className = 'badge badge-info';
        showView('view-demo-selector');
    }
}

function setupEventListeners() {
    document.getElementById('btn-start-demo').addEventListener('click', () => {
        const id = document.getElementById('demo-user-id').value;
        const username = document.getElementById('demo-username').value;
        if (!id) return showAlert('Ingrese un ID de usuario de Telegram', 'danger');

        const testUserObj = { id: Number(id), username, first_name: 'Conductor', last_name: 'Telegram' };
        localStorage.setItem('tg_user_session', JSON.stringify(testUserObj));
        autenticarTelegram(null, testUserObj);
    });

    document.getElementById('form-register-driver').addEventListener('submit', handleRegisterDriver);

    document.getElementById('trip-vehiculo').addEventListener('change', (e) => {
        const selectedId = Number(e.target.value);
        const vehicle = catalogVehicles.find(v => v.id_vehiculos === selectedId);
        if (vehicle) {
            const kmInput = document.getElementById('trip-km-inicial');
            kmInput.value = vehicle.kilometraje_actual;
            kmInput.min = vehicle.kilometraje_actual;
        }
    });

    document.getElementById('form-create-trip').addEventListener('submit', handleCreateTrip);

    // Acciones del Viaje
    document.getElementById('btn-start-trip').addEventListener('click', handleStartTrip);
    document.getElementById('btn-open-finish-modal').addEventListener('click', openFinishModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeFinishModal);
    document.getElementById('form-finish-trip').addEventListener('submit', handleFinishTrip);

    // Acciones de Parada
    document.getElementById('btn-open-stop-modal').addEventListener('click', openStopModal);
    document.getElementById('btn-close-stop-modal').addEventListener('click', closeStopModal);
    document.getElementById('form-register-stop').addEventListener('submit', handleRegisterStop);
    document.getElementById('btn-resume-trip').addEventListener('click', handleResumeTrip);

    document.getElementById('finish-km-final').addEventListener('input', (e) => {
        if (!currentActiveTrip) return;
        const finalKm = Number(e.target.value) || 0;
        const initialKm = currentActiveTrip.kilometraje_inicial;
        const distance = Math.max(0, finalKm - initialKm);

        document.getElementById('modal-km-inicial-val').textContent = `${initialKm} km`;
        document.getElementById('modal-km-recorridos-val').textContent = `${distance} km`;
    });

    document.getElementById('btn-new-trip-again').addEventListener('click', () => {
        currentActiveTrip = null;
        currentActiveStop = null;
        stopGpsTracking();
        loadNewTripForm();
    });
}

// ----------------------------------------------------
// AUTENTICACIÓN Y CARGA DE VISTAS
// ----------------------------------------------------
async function autenticarTelegram(initData, testUser) {
    showLoading(true);
    try {
        const res = await safeFetchJson(`${API_URL}/telegram/autenticar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData, testUser })
        });

        if (!res.success) {
            showLoading(false);
            return showAlert(res.message, 'danger');
        }

        currentTelegramUser = res.data.usuario_telegram;
        currentConductor = res.data.conductor;

        if (res.data.estado_registro === 'PENDIENTE' || !currentConductor) {
            showLoading(false);
            showView('view-registration');
        } else {
            await checkActiveTripOrLoadForm();
        }
    } catch (err) {
        showLoading(false);
        showAlert('Error al conectar con el servidor backend: ' + err.message, 'danger');
    }
}

async function handleRegisterDriver(e) {
    e.preventDefault();
    showLoading(true);

    const payload = {
        telegram_user_id: currentTelegramUser.telegram_user_id,
        nombre: document.getElementById('reg-nombre').value,
        telefono: document.getElementById('reg-telefono').value,
        licencia_numero: document.getElementById('reg-licencia-num').value,
        licencia_vencimiento: document.getElementById('reg-licencia-venc').value
    };

    try {
        const res = await safeFetchJson(`${API_URL}/telegram/registro-conductor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert('Conductor registrado y vinculado a Telegram exitosamente.', 'success');
        currentTelegramUser = res.data.usuario_telegram;
        currentConductor = res.data.conductor;

        await checkActiveTripOrLoadForm();
    } catch (err) {
        showLoading(false);
        showAlert('Error al guardar conductor: ' + err.message, 'danger');
    }
}

async function checkActiveTripOrLoadForm() {
    showLoading(true);
    try {
        const res = await safeFetchJson(`${API_URL}/viajes/activo?id_conductores=${currentConductor.id_conductores}`);
        showLoading(false);

        if (res.success && res.data) {
            currentActiveTrip = res.data;
            currentActiveStop = res.data.parada_activa || null;
            renderActiveTripView();
        } else {
            await loadNewTripForm();
        }
    } catch (err) {
        showLoading(false);
        showAlert('Error al consultar viajes activos: ' + err.message, 'danger');
    }
}

async function loadNewTripForm() {
    showLoading(true);
    try {
        const [resVeh, resLug] = await Promise.all([
            safeFetchJson(`${API_URL}/catalogos/vehiculos`),
            safeFetchJson(`${API_URL}/catalogos/lugares`)
        ]);

        showLoading(false);

        if (!resVeh.success || !resLug.success) {
            return showAlert('Error al cargar catálogos', 'danger');
        }

        catalogVehicles = resVeh.data;
        catalogPlaces = resLug.data;

        document.getElementById('trip-driver-name').textContent = currentConductor.nombre;
        const licenseBadge = document.getElementById('trip-license-badge');
        if (currentConductor.licencia_vigente) {
            licenseBadge.textContent = 'Licencia Vigente';
            licenseBadge.className = 'badge badge-success';
        } else {
            licenseBadge.textContent = 'Licencia Vencida';
            licenseBadge.className = 'badge badge-danger';
        }

        const vehSelect = document.getElementById('trip-vehiculo');
        vehSelect.innerHTML = '<option value="">-- Seleccionar Vehículo --</option>' +
            catalogVehicles.map(v => `<option value="${v.id_vehiculos}">${v.nombre} (${v.numero_economico}) - ${v.kilometraje_actual} km</option>`).join('');

        const origSelect = document.getElementById('trip-origen');
        const destSelect = document.getElementById('trip-destino');
        const placesOptions = '<option value="">-- Seleccionar --</option>' +
            catalogPlaces.map(l => `<option value="${l.id_lugares}">${l.nombre}</option>`).join('');

        origSelect.innerHTML = placesOptions;
        destSelect.innerHTML = placesOptions;

        showView('view-new-trip');
    } catch (err) {
        showLoading(false);
        showAlert('Error al cargar formulario de viaje: ' + err.message, 'danger');
    }
}

// ----------------------------------------------------
// CREACIÓN Y GESTIÓN DE VIAJES Y PARADAS
// ----------------------------------------------------
async function handleCreateTrip(e) {
    e.preventDefault();

    if (!currentConductor.licencia_vigente) {
        return showAlert('No puede registrar un viaje si su licencia está vencida.', 'danger');
    }

    const vehId = Number(document.getElementById('trip-vehiculo').value);
    const origId = Number(document.getElementById('trip-origen').value);
    const destId = Number(document.getElementById('trip-destino').value);
    const kmInicial = Number(document.getElementById('trip-km-inicial').value);
    const acompanantesStr = document.getElementById('trip-acompanantes').value;
    const motivo = document.getElementById('trip-motivo').value;

    if (origId === destId) {
        return showAlert('El lugar de origen debe ser distinto al lugar de destino.', 'danger');
    }

    const vehicle = catalogVehicles.find(v => v.id_vehiculos === vehId);
    if (vehicle && kmInicial < vehicle.kilometraje_actual) {
        return showAlert(`El kilometraje inicial no puede ser menor a ${vehicle.kilometraje_actual} km`, 'danger');
    }

    const payload = {
        id_conductores: currentConductor.id_conductores,
        id_vehiculos: vehId,
        id_origen: origId,
        id_destino: destId,
        kilometraje_inicial: kmInicial,
        acompanantes: acompanantesStr,
        motivo
    };

    showLoading(true);
    try {
        const res = await safeFetchJson(`${API_URL}/viajes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert(`Viaje registrado. Folio: ${res.data.folio}`, 'success');
        currentActiveTrip = res.data;
        renderActiveTripView();
    } catch (err) {
        showLoading(false);
        showAlert('Error al registrar viaje: ' + err.message, 'danger');
    }
}

function renderActiveTripView() {
    if (!currentActiveTrip) return;

    showView('view-active-trip');

    document.getElementById('active-folio').textContent = currentActiveTrip.folio;
    document.getElementById('active-conductor').textContent = currentActiveTrip.conductor_nombre || currentConductor.nombre;
    document.getElementById('active-vehiculo').textContent = `${currentActiveTrip.vehiculo_nombre} (${currentActiveTrip.numero_economico})`;
    document.getElementById('active-ruta').textContent = `${currentActiveTrip.origen_nombre} ➔ ${currentActiveTrip.destino_nombre}`;
    document.getElementById('active-km-inicial').textContent = `${currentActiveTrip.kilometraje_inicial} km`;

    const statusBadge = document.getElementById('active-status-badge');
    const btnStart = document.getElementById('btn-start-trip');
    const btnStopModal = document.getElementById('btn-open-stop-modal');
    const btnFinish = document.getElementById('btn-open-finish-modal');
    const btnNewAgain = document.getElementById('btn-new-trip-again');
    const summarySection = document.getElementById('active-summary-section');
    const stopCard = document.getElementById('active-stop-card');

    btnStart.classList.add('hidden');
    btnStopModal.classList.add('hidden');
    btnFinish.classList.add('hidden');
    btnNewAgain.classList.add('hidden');
    summarySection.classList.add('hidden');
    stopCard.classList.add('hidden');

    if (currentActiveTrip.id_estado_viaje === 2) { // PENDIENTE
        statusBadge.textContent = 'PENDIENTE';
        statusBadge.className = 'badge badge-warning';
        btnStart.classList.remove('hidden');
        stopGpsTracking();
    } else if (currentActiveTrip.id_estado_viaje === 3 || currentActiveTrip.id_estado_viaje === 4) { // EN_CURSO (3) o PAUSADO (4)
        if (currentActiveTrip.parada_activa || currentActiveTrip.id_estado_viaje === 4) {
            statusBadge.textContent = 'EN PARADA';
            statusBadge.className = 'badge badge-warning';
            stopCard.classList.remove('hidden');
            
            const stopReason = currentActiveTrip.parada_activa ? currentActiveTrip.parada_activa.motivo_parada : 'Parada activa';
            document.getElementById('stop-motivo-text').textContent = `Motivo: ${stopReason}`;
            startStopTimer(currentActiveTrip.parada_activa ? currentActiveTrip.parada_activa.hora_inicio : null);
        } else {
            statusBadge.textContent = 'EN_CURSO';
            statusBadge.className = 'badge badge-success';
            btnStopModal.classList.remove('hidden');
            btnFinish.classList.remove('hidden');
            stopStopTimer();
        }

        startGpsTracking();
    } else if (currentActiveTrip.id_estado_viaje === 5) { // FINALIZADO
        statusBadge.textContent = 'FINALIZADO';
        statusBadge.className = 'badge badge-info';
        btnNewAgain.classList.remove('hidden');
        summarySection.classList.remove('hidden');
        stopGpsTracking();
        stopStopTimer();
        renderSummaryDetails();
    }
}

async function handleStartTrip() {
    if (!currentActiveTrip) return;

    showLoading(true);
    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/iniciar`, {
            method: 'POST'
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert('Viaje iniciado. Transmisión GPS activada.', 'success');
        currentActiveTrip = res.data;
        renderActiveTripView();
    } catch (err) {
        showLoading(false);
        showAlert('Error al iniciar el viaje: ' + err.message, 'danger');
    }
}

// ----------------------------------------------------
// REGISTRO Y REANUDACIÓN DE PARADAS
// ----------------------------------------------------
function openStopModal() {
    document.getElementById('modal-stop-trip').classList.remove('hidden');
}

function closeStopModal() {
    document.getElementById('modal-stop-trip').classList.add('hidden');
}

async function handleRegisterStop(e) {
    e.preventDefault();
    if (!currentActiveTrip) return;

    const motivo = document.getElementById('stop-motivo-select').value;
    const observaciones = document.getElementById('stop-observaciones').value;

    const payload = {
        motivo_parada: motivo,
        latitud: lastGpsPosition ? lastGpsPosition.latitud : null,
        longitud: lastGpsPosition ? lastGpsPosition.longitud : null,
        observaciones
    };

    showLoading(true);
    closeStopModal();

    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/paradas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert('Parada registrada correctamente.', 'success');
        currentActiveStop = res.data;
        currentActiveTrip.id_estado_viaje = 4;
        currentActiveTrip.parada_activa = res.data;
        renderActiveTripView();
    } catch (err) {
        showLoading(false);
        showAlert('Error al registrar parada: ' + err.message, 'danger');
    }
}

async function handleResumeTrip() {
    if (!currentActiveTrip || !currentActiveTrip.parada_activa) return;

    const idParada = currentActiveTrip.parada_activa.id_paradas_viaje;
    showLoading(true);

    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/paradas/${idParada}/finalizar`, {
            method: 'POST'
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert('Parada finalizada. Viaje reanudado.', 'success');
        currentActiveTrip.id_estado_viaje = 3;
        currentActiveTrip.parada_activa = null;
        currentActiveStop = null;
        renderActiveTripView();
    } catch (err) {
        showLoading(false);
        showAlert('Error al reanudar viaje: ' + err.message, 'danger');
    }
}

function startStopTimer(startTimeIso) {
    stopStopTimer();
    const startTime = startTimeIso ? new Date(startTimeIso).getTime() : Date.now();

    function updateTimer() {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');
        const timerEl = document.getElementById('stop-timer');
        if (timerEl) timerEl.textContent = `${mm}:${ss}`;
    }

    updateTimer();
    stopTimerInterval = setInterval(updateTimer, 1000);
}

function stopStopTimer() {
    if (stopTimerInterval) {
        clearInterval(stopTimerInterval);
        stopTimerInterval = null;
    }
}

function openFinishModal() {
    if (!currentActiveTrip) return;
    document.getElementById('finish-km-final').value = currentActiveTrip.kilometraje_inicial;
    document.getElementById('modal-km-inicial-val').textContent = `${currentActiveTrip.kilometraje_inicial} km`;
    document.getElementById('modal-km-recorridos-val').textContent = `0 km`;
    document.getElementById('modal-finish-trip').classList.remove('hidden');
}

function closeFinishModal() {
    document.getElementById('modal-finish-trip').classList.add('hidden');
}

async function handleFinishTrip(e) {
    e.preventDefault();

    const kmFinal = Number(document.getElementById('finish-km-final').value);
    if (kmFinal < currentActiveTrip.kilometraje_inicial) {
        return showAlert('El kilometraje final no puede ser menor al inicial.', 'danger');
    }

    showLoading(true);
    closeFinishModal();

    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/finalizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kilometraje_final: kmFinal })
        });
        showLoading(false);

        if (!res.success) {
            return showAlert(res.message, 'danger');
        }

        showAlert('Viaje finalizado exitosamente.', 'success');
        currentActiveTrip = res.data;
        renderActiveTripView();
    } catch (err) {
        showLoading(false);
        showAlert('Error al finalizar viaje: ' + err.message, 'danger');
    }
}

function renderSummaryDetails() {
    if (!currentActiveTrip) return;

    document.getElementById('sum-hora-salida').textContent = currentActiveTrip.hora_salida ? new Date(currentActiveTrip.hora_salida).toLocaleString('es-MX') : '-';
    document.getElementById('sum-hora-llegada').textContent = currentActiveTrip.hora_llegada ? new Date(currentActiveTrip.hora_llegada).toLocaleString('es-MX') : '-';
    document.getElementById('sum-km-final').textContent = `${currentActiveTrip.kilometraje_final || 0} km`;
    document.getElementById('sum-km-recorridos').textContent = `${currentActiveTrip.kilometros_recorridos || 0} km`;

    let acompStr = '-';
    try {
        const arr = typeof currentActiveTrip.acompanantes === 'string' ? JSON.parse(currentActiveTrip.acompanantes) : currentActiveTrip.acompanantes;
        if (Array.isArray(arr) && arr.length > 0) acompStr = arr.join(', ');
    } catch (e) {}

    document.getElementById('sum-acompanantes').textContent = acompStr;
    document.getElementById('sum-motivo').textContent = currentActiveTrip.motivo || '-';
}

// ----------------------------------------------------
// RASTREO GPS AUTOMÁTICO Y SILENCIOSO
// ----------------------------------------------------
function startGpsTracking() {
    const pulse = document.getElementById('gps-pulse');
    const statusText = document.getElementById('gps-status-text');

    if (pulse) pulse.classList.add('active');
    if (statusText) statusText.textContent = 'GPS Transmitiendo (En Vivo)';

    updateNetworkBadge();

    if (!isGpsWatchStarted && navigator.geolocation) {
        isGpsWatchStarted = true;
        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                lastGpsPosition = {
                    latitud: pos.coords.latitude,
                    longitud: pos.coords.longitude,
                    precision_metros: pos.coords.accuracy,
                    velocidad: pos.coords.speed || 0,
                    direccion: pos.coords.heading || 0,
                    fecha_gps: new Date(pos.timestamp).toISOString()
                };

                const coordsEl = document.getElementById('gps-coords-display');
                if (coordsEl) {
                    coordsEl.textContent = `Lat: ${lastGpsPosition.latitud.toFixed(6)} | Lng: ${lastGpsPosition.longitud.toFixed(6)} | Precisión: ±${Math.round(lastGpsPosition.precision_metros)}m`;
                }
            },
            (err) => {
                console.warn('[GPS WATCH WARNING]', err.message);
                if (!lastGpsPosition) {
                    lastGpsPosition = {
                        latitud: 19.8456 + (Math.random() - 0.5) * 0.003,
                        longitud: -90.5312 + (Math.random() - 0.5) * 0.003,
                        precision_metros: 8,
                        velocidad: 30,
                        direccion: 90,
                        fecha_gps: new Date().toISOString()
                    };
                }
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
    }

    if (!gpsIntervalTimer) {
        sendGpsLocationToBackend();
        gpsIntervalTimer = setInterval(sendGpsLocationToBackend, 15000);
    }
}

function stopGpsTracking() {
    if (gpsIntervalTimer) {
        clearInterval(gpsIntervalTimer);
        gpsIntervalTimer = null;
    }

    const pulse = document.getElementById('gps-pulse');
    const statusText = document.getElementById('gps-status-text');

    if (pulse) pulse.classList.remove('active');
    if (statusText) statusText.textContent = 'GPS Detenido';
}

async function sendGpsLocationToBackend() {
    if (!currentActiveTrip) return;

    if (!lastGpsPosition) {
        lastGpsPosition = {
            latitud: 19.8456 + (Math.random() - 0.5) * 0.003,
            longitud: -90.5312 + (Math.random() - 0.5) * 0.003,
            precision_metros: 8,
            velocidad: 30,
            direccion: 90,
            fecha_gps: new Date().toISOString()
        };
    }

    if (!navigator.onLine) {
        saveLocationOffline(lastGpsPosition);
        return;
    }

    try {
        await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/ubicaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastGpsPosition)
        });
        
        await flushOfflineLocations();
    } catch (e) {
        saveLocationOffline(lastGpsPosition);
    }
}

// Manejo de Cola Offline en localStorage
function saveLocationOffline(location) {
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem('gps_offline_queue') || '[]');
    } catch (e) {}

    queue.push(location);
    localStorage.setItem('gps_offline_queue', JSON.stringify(queue));
    updateOfflineQueueUI(queue.length);
}

async function flushOfflineLocations() {
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem('gps_offline_queue') || '[]');
    } catch (e) {}

    if (!queue.length || !currentActiveTrip) return;

    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${currentActiveTrip.id_viajes}/ubicaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queue)
        });

        if (res.success) {
            localStorage.removeItem('gps_offline_queue');
            updateOfflineQueueUI(0);
            showAlert(`Sincronizadas ${queue.length} ubicación(es) guardadas offline.`, 'success');
        }
    } catch (e) {
        console.error('[OFFLINE SYNC ERROR]', e);
    }
}

function setupNetworkStatusListeners() {
    window.addEventListener('online', () => {
        updateNetworkBadge();
        flushOfflineLocations();
    });

    window.addEventListener('offline', () => {
        updateNetworkBadge();
    });
}

function updateNetworkBadge() {
    const badge = document.getElementById('gps-network-badge');
    if (!badge) return;

    if (navigator.onLine) {
        badge.textContent = 'Conexión Activa';
        badge.className = 'badge badge-success';
    } else {
        badge.textContent = 'Sin Conexión (Offline)';
        badge.className = 'badge badge-warning';
    }
}

function updateOfflineQueueUI(count) {
    const queueText = document.getElementById('offline-queue-text');
    if (!queueText) return;

    if (count > 0) {
        queueText.textContent = `Guardadas ${count} ubicación(es) localmente. Se enviarán al reconectar.`;
        queueText.classList.remove('hidden');
    } else {
        queueText.classList.add('hidden');
    }
}

// ----------------------------------------------------
// AUXILIARES DE INTERFAZ
// ----------------------------------------------------
function showView(viewId) {
    const views = ['view-demo-selector', 'view-registration', 'view-new-trip', 'view-active-trip'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === viewId) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
}

function showLoading(show) {
    const loader = document.getElementById('loading-state');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

function showAlert(message, type = 'info') {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');

    setTimeout(() => {
        alertBox.classList.add('hidden');
    }, 4500);
}
