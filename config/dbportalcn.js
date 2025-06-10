// portalcn://configuracion

require('dotenv').config(); // Cargar variables de entorno
const sql = require('mssql');

// Configuración para la base de datos 'dbportal'
const dbConfigPortal = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'dbportal', // Base de datos fija cambiada a 'dbportal'
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

let poolPortal;

async function connectToPortal() {
    try {
        poolPortal = await sql.connect(dbConfigPortal);
        console.log('Conectado a SQL Server - Base de datos: dbportal');
        return poolPortal;
    } catch (err) {
        console.error('Error al conectar a la base de datos dbportal:', err);
        throw err;
    }
}

module.exports = {
    getPool: async () => {
        if (!poolPortal || !poolPortal.connected) {
            return await connectToPortal();
        }
        return poolPortal;
    }
};
