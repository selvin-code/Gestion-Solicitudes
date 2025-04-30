const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const path = require('path');
const routes = require('./routes/route');
const { startServer } = require('./server');

dotenv.config();

const app = express();
const port = process.env.PORT || 4500;

// Configuración de middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar rutas
app.use('/', routes);

// Iniciar servidor
startServer(app, port);

module.exports = app;