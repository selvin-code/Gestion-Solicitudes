//configuracion para la base de datos VacacionesS
require('dotenv').config(); // Cargar variables de entorno
const sql = require('mssql');

// Configuración directa (solo "Vacaciones" como BD fija)
const dbConfigVacaciones = {
    user: process.env.DB_USER,      // Usuario desde variable de entorno
    password: process.env.DB_PASSWORD, // Contraseña desde variable de entorno
    server: process.env.DB_SERVER,  // Servidor desde variable de entorno
    database: 'Vacaciones',         // Nombre fijo
    options: {
        encrypt: true,
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let poolVacaciones;

async function connectToVacaciones() {
    try {
        poolVacaciones = await sql.connect(dbConfigVacaciones);
        console.log('Conectado a SQL Server - Base de datos: Vacaciones');
        return poolVacaciones;
    } catch (err) {
        console.error('Error al conectar a la base de datos Vacaciones:', err);
        throw err;
    }
}

module.exports = {
    getPool: async () => {
        if (!poolVacaciones || !poolVacaciones.connected) {
            return await connectToVacaciones();
        }
        return poolVacaciones;
    }
};