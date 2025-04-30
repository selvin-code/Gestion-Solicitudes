const sql = require('mssql');
const { getPool } = require('../config/dbPlanilla');

const consultarPuestoPorDNI = async (dni) => {
  const poolPlanilla = await getPool();

  try {
    if (!poolPlanilla || !poolPlanilla.connected) {
      throw new Error('Conexión con la base de datos Planilla no disponible');
    }

    console.log('🔄 Consultando datos de Puesto para DNI:', dni);
    console.log('Estado de la conexión:', poolPlanilla.connected ? 'Conectada' : 'No conectada');
    console.log('Base de datos actual:', poolPlanilla.config.database);

    const resultPuesto = await poolPlanilla
      .request()
      .input('dni', sql.VarChar, dni)
      .query('SELECT * FROM [Planilla].[dbo].[Puesto] WHERE DNI = @dni');

    console.log(resultPuesto);

    return resultPuesto.recordset.length > 0 ? resultPuesto.recordset[0] : null;
  } catch (error) {
    console.error('❌ Error al consultar datos de Puesto:', error.message);
    return null;
  }
};

const consultarUsuarios = async () => {
  const poolPlanilla = await getPool();

  try {
    if (!poolPlanilla || !poolPlanilla.connected) {
      throw new Error('Conexión con la base de datos Planilla no disponible');
    }

    console.log('🔄 Consultando datos de Usuarios');

    const resultUsuarios = await poolPlanilla
      .request()
      .query('SELECT * FROM [Permisos].[dbo].[usuarios]');

    return resultUsuarios.recordset.length > 0 ? resultUsuarios.recordset : [];
  } catch (error) {
    console.error('❌ Error al consultar datos de Usuarios:', error.message);
    return [];
  }
};

module.exports = { consultarPuestoPorDNI, consultarUsuarios };