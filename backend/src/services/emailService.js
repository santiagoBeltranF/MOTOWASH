import nodemailer from 'nodemailer'
import { query } from '../config/db.js'
import logger from '../utils/logger.js'

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
})

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#F8FAFC; font-family: 'Segoe UI', sans-serif; }
    .wrapper { max-width:600px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#1D4ED8,#2563EB); padding:32px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:26px; font-weight:700; letter-spacing:-0.5px; }
    .header p { color:#BFDBFE; margin:6px 0 0; font-size:14px; }
    .body { padding:36px 40px; }
    .footer { background:#F1F5F9; padding:20px 40px; text-align:center; font-size:12px; color:#94A3B8; }
    .btn { display:inline-block; background:#2563EB; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px; margin:20px 0; }
    .code-box { background:#EFF6FF; border:2px dashed #BFDBFE; border-radius:12px; padding:20px; text-align:center; margin:20px 0; }
    .code { font-size:36px; font-weight:700; color:#1D4ED8; letter-spacing:8px; }
    .info-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #F1F5F9; font-size:14px; }
    .label { color:#64748B; }
    .value { color:#1E293B; font-weight:500; }
    .promo-banner { background:linear-gradient(135deg,#0F6E56,#1D9E75); border-radius:12px; padding:24px; text-align:center; color:#fff; margin:20px 0; }
    .discount { font-size:48px; font-weight:700; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏍️ MotoWash</h1>
      <p>Sistema de Agendamiento Profesional</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} MotoWash. Todos los derechos reservados.</p>
      <p>Este correo fue enviado automáticamente, por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`

const logEmail = async (email, subject, type, status) => {
  try {
    await query('INSERT INTO email_logs (recipient_email, subject, type, status) VALUES (?,?,?,?)',
      [email, subject, type, status])
  } catch (e) {
    logger.error('Error logging email', e)
  }
}

export const send2FACode = async (email, name, code) => {
  const subject = 'Tu código de verificación — MotoWash'
  const html = baseTemplate(`
    <h2 style="color:#1E293B;margin:0 0 8px">Verificación de identidad</h2>
    <p style="color:#64748B;font-size:14px">Hola <strong>${name}</strong>, usa este código para iniciar sesión. Expira en <strong>10 minutos</strong>.</p>
    <div class="code-box">
      <div class="code">${code}</div>
      <p style="color:#64748B;font-size:12px;margin:8px 0 0">No compartas este código con nadie</p>
    </div>
    <p style="color:#94A3B8;font-size:13px">Si no intentaste iniciar sesión, ignora este correo.</p>
  `)
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject, html })
    await logEmail(email, subject, '2fa', 'sent')
    logger.info(`2FA code sent to ${email}`)
  } catch (err) {
    await logEmail(email, subject, '2fa', 'failed')
    logger.error('Error sending 2FA email', { err: err.message })
    throw err
  }
}

export const sendAppointmentConfirmation = async (email, name, appointment) => {
  const subject = `Cita confirmada — ${appointment.service} el ${appointment.date}`
  const html = baseTemplate(`
    <h2 style="color:#1E293B;margin:0 0 8px">¡Cita confirmada! ✅</h2>
    <p style="color:#64748B;font-size:14px">Hola <strong>${name}</strong>, tu cita ha sido agendada exitosamente.</p>
    <div style="background:#F8FAFC;border-radius:12px;padding:20px;margin:20px 0;">
      <div class="info-row"><span class="label">Servicio</span><span class="value">${appointment.service}</span></div>
      <div class="info-row"><span class="label">Fecha</span><span class="value">${appointment.date}</span></div>
      <div class="info-row"><span class="label">Hora</span><span class="value">${appointment.time}</span></div>
      <div class="info-row" style="border:none"><span class="label">Precio</span><span class="value" style="color:#2563EB;font-size:16px">${appointment.price}</span></div>
    </div>
    <p style="color:#64748B;font-size:13px">Si necesitas cancelar, hazlo con al menos 2 horas de anticipación.</p>
  `)
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject, html })
    await logEmail(email, subject, 'appointment_confirm', 'sent')
  } catch (err) {
    await logEmail(email, subject, 'appointment_confirm', 'failed')
    logger.error('Error sending appointment email', { err: err.message })
  }
}

export const sendAppointmentCancellation = async (email, name, appointment) => {
  const subject = `Cita cancelada — MotoWash`
  const html = baseTemplate(`
    <h2 style="color:#EF4444;margin:0 0 8px">Cita cancelada</h2>
    <p style="color:#64748B;font-size:14px">Hola <strong>${name}</strong>, tu cita ha sido cancelada.</p>
    <div style="background:#FEF2F2;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #EF4444;">
      <div class="info-row"><span class="label">Servicio</span><span class="value">${appointment.service}</span></div>
      <div class="info-row" style="border:none"><span class="label">Fecha</span><span class="value">${appointment.date} a las ${appointment.time}</span></div>
    </div>
    <p style="color:#64748B;font-size:13px">Puedes agendar una nueva cita en cualquier momento.</p>
  `)
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject, html })
    await logEmail(email, subject, 'appointment_cancel', 'sent')
  } catch (err) {
    await logEmail(email, subject, 'appointment_cancel', 'failed')
  }
}

export const sendPromotionEmail = async (clients, promotion) => {
  const subject = `🎉 Promoción especial — ${promotion.discount}% de descuento hoy`
  let sent = 0, failed = 0
  for (const client of clients) {
    const html = baseTemplate(`
      <h2 style="color:#1E293B;margin:0 0 8px">¡Oferta especial para ti!</h2>
      <p style="color:#64748B;font-size:14px">Hola <strong>${client.name}</strong>, tenemos una promoción exclusiva por tiempo limitado.</p>
      <div class="promo-banner">
        <p style="margin:0 0 4px;font-size:14px;opacity:0.8">${promotion.title}</p>
        <div class="discount">${promotion.discount}% OFF</div>
        <p style="margin:8px 0 0;font-size:13px;opacity:0.8">Válido hasta: ${promotion.ends_at}</p>
      </div>
      <p style="color:#64748B;font-size:14px">${promotion.description || 'Aprovecha este descuento especial en nuestros servicios.'}</p>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/client/book" class="btn">Agendar ahora →</a>
      </div>
    `)
    try {
      await transporter.sendMail({ from: process.env.MAIL_FROM, to: client.email, subject, html })
      await logEmail(client.email, subject, 'promotion', 'sent')
      sent++
    } catch {
      await logEmail(client.email, subject, 'promotion', 'failed')
      failed++
    }
  }
  logger.info(`Promotion emails: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}

export const sendWelcomeEmail = async (email, name) => {
  const subject = 'Bienvenido a MotoWash 🏍️'
  const html = baseTemplate(`
    <h2 style="color:#1E293B;margin:0 0 8px">¡Bienvenido, ${name}!</h2>
    <p style="color:#64748B;font-size:14px">Tu cuenta ha sido creada exitosamente. Ya puedes agendar tu primera cita.</p>
    <div style="text-align:center">
      <a href="${process.env.FRONTEND_URL}/client/book" class="btn">Agendar cita →</a>
    </div>
  `)
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject, html })
    await logEmail(email, subject, 'welcome', 'sent')
  } catch (err) {
    await logEmail(email, subject, 'welcome', 'failed')
  }
}
