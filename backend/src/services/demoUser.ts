import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const DEMO_EMAIL = 'demo@gmail.com';
const DEMO_PASSWORD = 'demo';

export async function ensureDemoUser(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await prisma.user.create({
    data: { email: DEMO_EMAIL, passwordHash, displayName: 'Demo', emailVerified: true },
  });
  console.log(`[seed] Created demo user (${DEMO_EMAIL})`);
}
