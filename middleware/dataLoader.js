const { consultarPuestoPorDNI, consultarUsuarios } = require('../services/planillaService');

const cargarDatosPuestoYUsuarios = async (req, res, next) => {
  res.locals.puesto = null;
  res.locals.usuarios = null;

  if (req.usuario) {
    const puestoData = await consultarPuestoPorDNI(req.usuario.id);
    res.locals.puesto = puestoData || {
      NombrePersona: req.usuario.nombre,
      unidad: req.usuario.unidad || 'Sin unidad asignada',
      DNI: req.usuario.id,
    };
  }

  res.locals.usuarios = await consultarUsuarios();
  next();
};

module.exports = { cargarDatosPuestoYUsuarios };