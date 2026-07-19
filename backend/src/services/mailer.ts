import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendVerificationEmail(
  to: string,
  displayName: string,
  token: string
): Promise<void> {
  const link = `${config.frontendUrl}/verify-email?token=${token}`;

  if (!config.smtp.host) {
    if (config.appEnv === 'dev') {
      console.log(`[mailer] SMTP not configured — verification link for ${to}: ${link}`);
      return;
    }
    throw new Error('SMTP is not configured (SMTP_HOST missing)');
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject: 'Confirm your MusicVault account',
    text: `Hi ${displayName},\n\nConfirm your email address to finish creating your MusicVault account:\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${displayName},</p><p>Confirm your email address to finish creating your MusicVault account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}
