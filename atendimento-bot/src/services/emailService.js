const nodemailer = require("nodemailer");

const PORTA = Number(process.env.SMTP_PORTA || 465);

const transporte = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: PORTA,
  secure: PORTA === 465, // 465 já abre com TLS; 587 negocia depois (STARTTLS)
  auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA },
});

async function enviarEmail({ para, assunto, texto, html }) {
  await transporte.sendMail({
    from: process.env.EMAIL_REMETENTE || process.env.SMTP_USUARIO,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

module.exports = { enviarEmail };