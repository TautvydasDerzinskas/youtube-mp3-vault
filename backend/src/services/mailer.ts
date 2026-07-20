import nodemailer from 'nodemailer';
import { config } from '../config';
import { getSmtpSettings } from './settings';

export async function sendVerificationEmail(
  to: string,
  displayName: string,
  token: string
): Promise<void> {
  const link = `${config.frontendUrl}/verify-email?token=${token}`;
  const smtp = getSmtpSettings();

  if (!smtp.host) {
    if (config.appEnv === 'dev') {
      console.log(`[mailer] SMTP not configured — verification link for ${to}: ${link}`);
      return;
    }
    throw new Error('SMTP is not configured');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? undefined } : undefined,
  });

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: 'Confirm your YoutubeVault account',
    text: `Hi ${displayName},\n\nConfirm your email address to finish creating your YoutubeVault account:\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${displayName},</p><p>Confirm your email address to finish creating your YoutubeVault account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}
