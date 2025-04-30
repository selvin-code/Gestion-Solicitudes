//configuracion para la base de datos planilla
require('dotenv').config(); // Cargar variables de entorno
const sql = require('mssql');

// Configuración directa (solo "Planilla" como BD fija)
const dbConfigPlanilla = {
    user: process.env.DB_USER,      // Usuario desde variable de entorno
    password: process.env.DB_PASSWORD, // Contraseña desde variable de entorno
    server: process.env.DB_SERVER,  // Servidor desde variable de entorno
    database: 'Planilla',           // Nombre fijo
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

let poolPlanilla;

async function connectToPlanilla() {
    try {
        poolPlanilla = await sql.connect(dbConfigPlanilla);
        console.log('Conectado a SQL Server - Base de datos: Planilla');
        return poolPlanilla;
    } catch (err) {
        console.error('Error al conectar a la base de datos Planilla:', err);
        throw err;
    }
}

module.exports = {
    getPool: async () => {
        if (!poolPlanilla || !poolPlanilla.connected) {
            return await connectToPlanilla();
        }
        return poolPlanilla;
    }
};