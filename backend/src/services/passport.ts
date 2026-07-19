import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      if (!user.emailVerified) {
        return done(null, false, {
          message: 'Please verify your email before signing in',
          code: 'EMAIL_NOT_VERIFIED',
        } as { message: string; code: string });
      }
      if (user.isBanned) {
        return done(null, false, {
          message: 'Your account has been suspended',
          code: 'ACCOUNT_BANNED',
        } as { message: string; code: string });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

export default passport;
