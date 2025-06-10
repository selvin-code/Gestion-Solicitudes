const jwt = require('jsonwebtoken');

const verificarCookie = (req, res, next) => {
  console.log('🔹 Middleware verificarCookie ejecutado.');
  console.log('📌 Cookies recibidas:', req.cookies);

  if (req.cookies.jwt) {
    jwt.verify(req.cookies.jwt, 'super_secret', (err, decoded) => {
      if (err) {
        console.log('❌ Error al verificar JWT:', err.message);
        req.usuario = null;
      } else {
        console.log('✅ JWT válido, usuario decodificado:', JSON.stringify(decoded, null, 2));
        req.usuario = decoded;
      }
      console.log('➡️ Pasando al siguiente middleware...\n');
      next();
    });
  } else {
    console.log('⚠️ No se encontró la cookie JWT');
    req.usuario = null;
    next();
  }
};

const protegerRuta = (req, res, next) => {
  if (!req.usuario) {
    // Renderiza la vista aviso.ejs en lugar de enviar JSON
    return res.status(401).render('aviso', {
      titulo: 'Acceso no autorizado',
      mensaje: 'No autenticado. Por favor, inicie sesión.'
    });
  }
  next();
};

module.exports = { verificarCookie, protegerRuta };