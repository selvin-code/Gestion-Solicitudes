const { getPool: getPoolPlanilla } = require('./config/dbPlanilla');
const { getPool: getPoolPermisos } = require('./config/dbconfig');
const { getPool: getPoolVacaciones } = require('./config/dbVacaciones');

async function startServer(app, port) {
  try {
    // Inicializar pools de conexión
    const poolPlanilla = await getPoolPlanilla();
    const poolPermisos = await getPoolPermisos();
    const poolVacaciones = await getPoolVacaciones();

    // Guardar pools en app.locals para acceso global
    app.locals.poolPlanilla = poolPlanilla;
    app.locals.poolPermisos = poolPermisos;
    app.locals.poolVacaciones = poolVacaciones;

    // Iniciar servidor
    app.listen(port, () => {
      console.log(`🚀 Servidor iniciado en http://solicitudes.consucoop.local:${port}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message);
    setTimeout(() => startServer(app, port), 5000); // Reintentar después de 5 segundos
  }
}

module.exports = { startServer };