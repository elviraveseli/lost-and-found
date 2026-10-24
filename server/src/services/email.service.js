import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// Email is optional. Without SMTP_HOST the app works normally and only creates
// in-app notifications.
let transporter;

function getTransporter() {
  if (!config.emailEnabled) return null;
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendEmail({ to, subject, text }) {
  const transport = getTransporter();
  if (!transport) return false;
  try {
    await transport.sendMail({ from: config.EMAIL_FROM, to, subject, text });
    return true;
  } catch (err) {
    // Do not log the recipient or body; the error codes are enough to debug SMTP.
    logger.warn({ code: err.code, responseCode: err.responseCode }, 'Email delivery failed');
    return false;
  }
}
