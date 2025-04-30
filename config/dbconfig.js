//configuracion para la base de datos de Permisos 
const sql = require('mssql');

const config = {
    user: 'APPLOG01',
    password: 'DataStore2023.0801',
    server: '192.168.1.16\\CNSCSQL001',
    database: 'Permisos',
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

let poolPermisos;

async function connectToPermisos() {
    try {
        poolPermisos = await sql.connect(config);
        console.log('Conexión exitosa a la base de datos Permisos');
        return poolPermisos;
    } catch (err) {
        console.error('Error al conectar a la base de datos Permisos:', err);
        throw err;
    }
}

module.exports = {
    getPool: async () => {
        if (!poolPermisos || !poolPermisos.connected) {
            return await connectToPermisos();
        }
        return poolPermisos;
    }
};