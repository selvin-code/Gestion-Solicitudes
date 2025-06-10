//configuracion para la base de datos de perfil 
const sql = require('mssql');

const config = {
    user: 'APPLOG01',
    password: 'DataStore2023.0801',
    server: '192.168.1.16\\CNSCSQL001',
    database: 'perfil',
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

let poolperfil;

async function connectToPerfil() {
    try {
        poolperfil = await sql.connect(config);
        console.log('Conexión exitosa a la base de datos perfil');
        return poolperfil;
    } catch (err) {
        console.error('Error al conectar a la base de datos perfil:', err);
        throw err;
    }
}

module.exports = {
    getPool: async () => {
        if (!poolperfil || !poolperfil.connected) {
            return await connectToPerfil();
        }
        return poolperfil;
    }
};