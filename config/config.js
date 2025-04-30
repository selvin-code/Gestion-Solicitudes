require('dotenv').config({ path: './env/.env' });

module.exports = {
    jwt_expires: process.env.JWT_EXPIRES || '2h',
    port: process.env.PORT || 4500
}