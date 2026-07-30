-- Activar restricciones de llaves foráneas en SQLite
PRAGMA foreign_keys = ON;

-- 1. Tabla: conductores
CREATE TABLE IF NOT EXISTS conductores (
    id_conductores INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(150) NOT NULL,
    licencia_numero VARCHAR(50),
    licencia_vigente INTEGER NOT NULL DEFAULT 0 CHECK (licencia_vigente IN (0, 1)),
    licencia_vencimiento DATE,
    telefono VARCHAR(30),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla: vehiculos
CREATE TABLE IF NOT EXISTS vehiculos (
    id_vehiculos INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    numero_economico VARCHAR(50) NOT NULL UNIQUE,
    placas VARCHAR(20),
    kilometraje_actual INTEGER NOT NULL DEFAULT 0 CHECK (kilometraje_actual >= 0),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla: lugares
CREATE TABLE IF NOT EXISTS lugares (
    id_lugares INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    direccion TEXT,
    latitud REAL CHECK (latitud IS NULL OR (latitud >= -90.0 AND latitud <= 90.0)),
    longitud REAL CHECK (longitud IS NULL OR (longitud >= -180.0 AND longitud <= 180.0)),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla: estados_viaje
CREATE TABLE IF NOT EXISTS estados_viaje (
    id_estado_viaje INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla: viajes
CREATE TABLE IF NOT EXISTS viajes (
    id_viajes INTEGER PRIMARY KEY AUTOINCREMENT,
    folio VARCHAR(30) NOT NULL UNIQUE,
    id_conductores INTEGER NOT NULL REFERENCES conductores(id_conductores),
    id_vehiculos INTEGER NOT NULL REFERENCES vehiculos(id_vehiculos),
    id_origen INTEGER NOT NULL REFERENCES lugares(id_lugares),
    id_destino INTEGER NOT NULL REFERENCES lugares(id_lugares),
    id_estado_viaje INTEGER NOT NULL REFERENCES estados_viaje(id_estado_viaje),
    acompanantes TEXT NOT NULL DEFAULT '[]',
    licencia_vigente INTEGER NOT NULL CHECK (licencia_vigente IN (0, 1)),
    kilometraje_inicial INTEGER NOT NULL CHECK (kilometraje_inicial >= 0),
    kilometraje_final INTEGER NULL CHECK (kilometraje_final IS NULL OR kilometraje_final >= kilometraje_inicial),
    kilometros_recorridos INTEGER NULL CHECK (kilometros_recorridos IS NULL OR kilometros_recorridos >= 0),
    motivo TEXT NOT NULL,
    fecha DATE NOT NULL DEFAULT (CURRENT_DATE),
    hora_salida DATETIME NULL,
    hora_llegada DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_viaje_origen_destino CHECK (id_origen <> id_destino),
    CONSTRAINT chk_viaje_acompanantes_json CHECK (json_valid(acompanantes) = 1 AND json_type(acompanantes) = 'array'),
    CONSTRAINT chk_viaje_horas CHECK (hora_salida IS NULL OR hora_llegada IS NULL OR hora_llegada >= hora_salida)
);

-- 6. Tabla: ubicaciones_viaje
CREATE TABLE IF NOT EXISTS ubicaciones_viaje (
    id_ubicaciones_viaje INTEGER PRIMARY KEY AUTOINCREMENT,
    id_viajes INTEGER NOT NULL REFERENCES viajes(id_viajes) ON DELETE CASCADE,
    latitud REAL NOT NULL CHECK (latitud >= -90.0 AND latitud <= 90.0),
    longitud REAL NOT NULL CHECK (longitud >= -180.0 AND longitud <= 180.0),
    precision_metros REAL NULL CHECK (precision_metros IS NULL OR precision_metros >= 0),
    velocidad REAL NULL CHECK (velocidad IS NULL OR velocidad >= 0),
    direccion REAL NULL CHECK (direccion IS NULL OR (direccion >= 0 AND direccion <= 360.0)),
    fecha_gps DATETIME NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla: paradas_viaje (NUEVA: Registro de Paradas durante el Viaje)
CREATE TABLE IF NOT EXISTS paradas_viaje (
    id_paradas_viaje INTEGER PRIMARY KEY AUTOINCREMENT,
    id_viajes INTEGER NOT NULL REFERENCES viajes(id_viajes) ON DELETE CASCADE,
    motivo_parada VARCHAR(150) NOT NULL,
    latitud REAL CHECK (latitud IS NULL OR (latitud >= -90.0 AND latitud <= 90.0)),
    longitud REAL CHECK (longitud IS NULL OR (longitud >= -180.0 AND longitud <= 180.0)),
    hora_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hora_fin DATETIME NULL,
    duracion_minutos INTEGER NULL CHECK (duracion_minutos IS NULL OR duracion_minutos >= 0),
    observaciones TEXT,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla: historial_estados_viaje
CREATE TABLE IF NOT EXISTS historial_estados_viaje (
    id_historial_estado_viaje INTEGER PRIMARY KEY AUTOINCREMENT,
    id_viajes INTEGER NOT NULL REFERENCES viajes(id_viajes) ON DELETE CASCADE,
    id_estado_anterior INTEGER NULL REFERENCES estados_viaje(id_estado_viaje),
    id_estado_nuevo INTEGER NOT NULL REFERENCES estados_viaje(id_estado_viaje),
    observaciones TEXT,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_historial_estado_diferente CHECK (id_estado_anterior IS NULL OR id_estado_anterior <> id_estado_nuevo)
);

-- 9. Tabla: usuarios_telegram
CREATE TABLE IF NOT EXISTS usuarios_telegram (
    id_usuario_telegram INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL UNIQUE,
    telegram_username VARCHAR(100),
    telegram_first_name VARCHAR(150),
    telegram_last_name VARCHAR(150),
    id_conductores INTEGER UNIQUE REFERENCES conductores(id_conductores),
    rol VARCHAR(30) NOT NULL DEFAULT 'CONDUCTOR' CHECK (rol IN ('CONDUCTOR', 'ADMINISTRADOR', 'SUPERVISOR')),
    estado_registro VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_registro IN ('PENDIENTE', 'COMPLETO', 'BLOQUEADO')),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    ultimo_acceso_en DATETIME,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabla: usuarios_admin
CREATE TABLE IF NOT EXISTS usuarios_admin (
    id_usuarios_admin INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(150) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    correo VARCHAR(200) UNIQUE,
    password_hash TEXT NOT NULL,
    rol VARCHAR(30) NOT NULL DEFAULT 'OPERADOR' CHECK (rol IN ('ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'CONSULTA')),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    intentos_fallidos INTEGER NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
    bloqueado_hasta DATETIME NULL,
    ultimo_acceso_en DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Creación de Índices para Optimización
CREATE INDEX IF NOT EXISTS idx_viajes_conductores ON viajes(id_conductores);
CREATE INDEX IF NOT EXISTS idx_viajes_vehiculos ON viajes(id_vehiculos);
CREATE INDEX IF NOT EXISTS idx_viajes_estado ON viajes(id_estado_viaje);
CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON viajes(fecha);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_viaje_viaje ON ubicaciones_viaje(id_viajes);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_viaje_fecha ON ubicaciones_viaje(fecha_gps);
CREATE INDEX IF NOT EXISTS idx_paradas_viaje_viaje ON paradas_viaje(id_viajes);
CREATE INDEX IF NOT EXISTS idx_historial_viaje ON historial_estados_viaje(id_viajes);
CREATE INDEX IF NOT EXISTS idx_usuarios_telegram_user ON usuarios_telegram(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telegram_conductor ON usuarios_telegram(id_conductores);
CREATE INDEX IF NOT EXISTS idx_usuarios_admin_username ON usuarios_admin(username);
