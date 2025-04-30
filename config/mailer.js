const nodemailer = require('nodemailer');

// Configuración del transporter
const transporter = nodemailer.createTransport({
    host: 'mail.consucoop.hn',
    port: 465,
    secure: true,
    auth: {
        user: 'tecnologia@consucoop.hn',
        pass: 'DataLink0801.'
    }
});

// Función para enviar correo al jefe cuando se crea una nueva solicitud
const sendNewRequestEmail = async (to, solicitud) => {
    const mailOptions = {
        from: 'tecnologia@consucoop.hn',
        to: to,
        subject: `Nueva Solicitud de Vacaciones - CONSUCOOP`,
        html: `
            <html>
                <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #333333; background-color: #f4f4f4;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                                    <!-- Encabezado -->
                                    <tr>
                                        <td bgcolor="#003087" style="padding: 20px; text-align: center;">
                                            <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: normal;">CONSUCOOP</h1>
                                            <p style="color: #ffffff; font-size: 14px; margin: 5px 0 0;">Sistema de Gestión de Solicitudes</p>
                                        </td>
                                    </tr>
                                    <!-- Contenido -->
                                    <tr>
                                        <td style="padding: 30px;">
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Estimado(a) Supervisor(a),</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Hemos recibido una nueva solicitud de vacaciones. Por favor, revise los detalles a continuación:</p>
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f9f9f9; border-radius: 6px; padding: 20px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Solicitante:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.nombre}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Área:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.area_solicitante}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Fecha de Solicitud:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_solicitud).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Periodo:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_inicio).toISOString().split('T')[0]} - ${new Date(solicitud.fecha_fin).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Reincorporación:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_reincorporacion).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Días:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.total_dias}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Observaciones:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.observaciones || 'Ninguna'}</td>
                                                </tr>
                                            </table>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Le solicitamos revisar la solicitud en el sistema y tomar las acciones correspondientes a la brevedad posible.</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0;">Atentamente,<br>Equipo de Recursos Humanos<br>CONSUCOOP</p>
                                        </td>
                                    </tr>
                                    <!-- Pie de página -->
                                    <tr>
                                        <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center; font-size: 14px; color: #666666;">
                                            <p style="margin: 0;">Sistema de Gestión de Solicitudes | CONSUCOOP</p>
                                            <p style="margin: 5px 0 0;">Este es un mensaje automático, por favor no responda directamente a este correo.</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo de nueva solicitud enviado:', info.response);
        return { success: true, message: 'Correo de nueva solicitud enviado exitosamente' };
    } catch (error) {
        console.error('Error al enviar correo de nueva solicitud:', error);
        console.error('Detalles del error SMTP:', error.code, error.command);
        return { success: false, message: 'No se pudo enviar el correo de nueva solicitud.' };
    }
};

// Función para enviar correo a RRHH cuando el jefe aprueba
const sendSupervisorApprovedEmail = async (to, solicitud) => {
    const mailOptions = {
        from: 'tecnologia@consucoop.hn',
        to: to,
        subject: `Solicitud de Vacaciones Aprobada por Jefe - CONSUCOOP`,
        html: `
            <html>
                <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #333333; background-color: #f4f4f4;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                                    <!-- Encabezado -->
                                    <tr>
                                        <td bgcolor="#003087" style="padding: 20px; text-align: center;">
                                            <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: normal;">CONSUCOOP</h1>
                                            <p style="color: #ffffff; font-size: 14px; margin: 5px 0 0;">Sistema de Gestión de Solicitudes</p>
                                        </td>
                                    </tr>
                                    <!-- Contenido -->
                                    <tr>
                                        <td style="padding: 30px;">
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Estimado equipo de Recursos Humanos,</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Una solicitud de vacaciones ha sido aprobada por el jefe inmediato. Por favor, revise los detalles a continuación:</p>
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f9f9f9; border-radius: 6px; padding: 20px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Solicitante:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.nombre}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Área:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.area_solicitante}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Fecha de Solicitud:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_solicitud).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Periodo:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_inicio).toISOString().split('T')[0]} - ${new Date(solicitud.fecha_fin).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Reincorporación:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_reincorporacion).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Días:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.total_dias}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Observaciones:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.observaciones || 'Ninguna'}</td>
                                                </tr>
                                            </table>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Le solicitamos proceder con la revisión y aprobación final en el sistema.</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0;">Atentamente,<br>Equipo de Recursos Humanos<br>CONSUCOOP</p>
                                        </td>
                                    </tr>
                                    <!-- Pie de página -->
                                    <tr>
                                        <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center; font-size: 14px; color: #666666;">
                                            <p style="margin: 0;">Sistema de Gestión de Solicitudes | CONSUCOOP</p>
                                            <p style="margin: 5px 0 0;">Este es un mensaje automático, por favor no responda directamente a este correo.</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo de aprobación por jefe enviado:', info.response);
        return { success: true, message: 'Correo de aprobación por jefe enviado exitosamente' };
    } catch (error) {
        console.error('Error al enviar correo de aprobación por jefe:', error);
        console.error('Detalles del error SMTP:', error.code, error.command);
        return { success: false, message: 'No se pudo enviar el correo de aprobación por jefe.' };
    }
};

// Función para enviar correo al usuario cuando la solicitud es rechazada
const sendRequestRejectedEmail = async (to, solicitud, rejectedBy, observaciones_rechazo) => {
    const rejectedByText = rejectedBy === 'jefe' ? 'su jefe inmediato' : 'Recursos Humanos';
    const mailOptions = {
        from: 'tecnologia@consucoop.hn',
        to: to,
        subject: `Solicitud de Vacaciones Rechazada - CONSUCOOP`,
        html: `
            <html>
                <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #333333; background-color: #f4f4f4;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                                    <!-- Encabezado -->
                                    <tr>
                                        <td bgcolor="#003087" style="padding: 20px; text-align: center;">
                                            <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: normal;">CONSUCOOP</h1>
                                            <p style="color: #ffffff; font-size: 14px; margin: 5px 0 0;">Sistema de Gestión de Solicitudes</p>
                                        </td>
                                    </tr>
                                    <!-- Contenido -->
                                    <tr>
                                        <td style="padding: 30px;">
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Estimado(a) ${solicitud.nombre},</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Lamentamos informarle que su solicitud de vacaciones ha sido rechazada por ${rejectedByText}. A continuación, se presentan los detalles:</p>
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f9f9f9; border-radius: 6px; padding: 20px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Fecha de Solicitud:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_solicitud).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Periodo:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_inicio).toISOString().split('T')[0]} - ${new Date(solicitud.fecha_fin).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Días:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.total_dias}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Motivo del Rechazo:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${observaciones_rechazo || 'No especificado'}</td>
                                                </tr>
                                            </table>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Para mayor información, por favor contacte a ${rejectedByText}.</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0;">Atentamente,<br>Equipo de Recursos Humanos<br>CONSUCOOP</p>
                                        </td>
                                    </tr>
                                    <!-- Pie de página -->
                                    <tr>
                                        <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center; font-size: 14px; color: #666666;">
                                            <p style="margin: 0;">Sistema de Gestión de Solicitudes | CONSUCOOP</p>
                                            <p style="margin: 5px 0 0;">Este es un mensaje automático, por favor no responda directamente a este correo.</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Correo de solicitud rechazada (${rejectedBy}) enviado:`, info.response);
        return { success: true, message: `Correo de solicitud rechazada (${rejectedBy}) enviado exitosamente` };
    } catch (error) {
        console.error(`Error al enviar correo de solicitud rechazada (${rejectedBy}):`, error);
        console.error('Detalles del error SMTP:', error.code, error.command);
        return { success: false, message: `No se pudo enviar el correo de solicitud rechazada (${rejectedBy}).` };
    }
};

// Función para enviar correo al usuario cuando la solicitud es aprobada por RRHH
const sendRequestFullyApprovedEmail = async (to, solicitud) => {
    const mailOptions = {
        from: 'tecnologia@consucoop.hn',
        to: to,
        subject: `Solicitud de Vacaciones Aprobada - CONSUCOOP`,
        html: `
            <html>
                <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #333333; background-color: #f4f4f4;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                                    <!-- Encabezado -->
                                    <tr>
                                        <td bgcolor="#003087" style="padding: 20px; text-align: center;">
                                            <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: normal;">CONSUCOOP</h1>
                                            <p style="color: #ffffff; font-size: 14px; margin: 5px 0 0;">Sistema de Gestión de Solicitudes</p>
                                        </td>
                                    </tr>
                                    <!-- Contenido -->
                                    <tr>
                                        <td style="padding: 30px;">
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Estimado(a) ${solicitud.nombre},</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Nos complace informarle que su solicitud de vacaciones ha sido aprobada por el departamento de Recursos Humanos. A continuación, se presentan los detalles:</p>
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f9f9f9; border-radius: 6px; padding: 20px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Fecha de Solicitud:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_solicitud).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Periodo:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_inicio).toISOString().split('T')[0]} - ${new Date(solicitud.fecha_fin).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Reincorporación:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${new Date(solicitud.fecha_reincorporacion).toISOString().split('T')[0]}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Días:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.total_dias}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 16px; padding: 8px 0; vertical-align: top;">
                                                        <strong style="color: #003087;">Observaciones:</strong>
                                                    </td>
                                                    <td style="font-size: 16px; padding: 8px 0;">${solicitud.observaciones || 'Ninguna'}</td>
                                                </tr>
                                            </table>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">Agradecemos su uso del sistema de gestión de solicitudes y quedamos a su disposición para cualquier consulta.</p>
                                            <p style="font-size: 16px; line-height: 1.5; margin: 0;">Atentamente,<br>Equipo de Recursos Humanos<br>CONSUCOOP</p>
                                        </td>
                                    </tr>
                                    <!-- Pie de página -->
                                    <tr>
                                        <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center; font-size: 14px; color: #666666;">
                                            <p style="margin: 0;">Sistema de Gestión de Solicitudes | CONSUCOOP</p>
                                            <p style="margin: 5px 0 0;">Este es un mensaje automático, por favor no responda directamente a este correo.</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo de solicitud aprobada por RRHH enviado:', info.response);
        return { success: true, message: 'Correo de solicitud aprobada por RRHH enviado exitosamente' };
    } catch (error) {
        console.error('Error al enviar correo de solicitud aprobada por RRHH:', error);
        console.error('Detalles del error SMTP:', error.code, error.command);
        return { success: false, message: 'No se pudo enviar el correo de solicitud aprobada por RRHH.' };
    }
};

module.exports = {
    sendNewRequestEmail,
    sendSupervisorApprovedEmail,
    sendRequestRejectedEmail,
    sendRequestFullyApprovedEmail
};