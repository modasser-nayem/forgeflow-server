import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailProvider } from 'src/modules/notifications/application/interfaces/email-provider.interface';
import { FakeEmailProvider } from '../../fakes/fake-email.provider';
import { TokenService } from 'src/modules/auth/infrastructure/token/token.service';
import { PasswordService } from 'src/modules/auth/infrastructure/password/password.service';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fakeEmailProvider: FakeEmailProvider;
  let tokenService: TokenService;
  let passwordService: PasswordService;

  beforeAll(async () => {
    fakeEmailProvider = new FakeEmailProvider();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailProvider)
      .useValue(fakeEmailProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);
    passwordService = app.get(PasswordService);

    // Clean DB before all tests
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
  });

  async function cleanDatabase() {
    await prisma.session.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
  }

  describe('Registration', () => {
    const validEmail = 'valid.user@example.com';
    const password = 'StrongPassword123!';

    it('should successfully register a valid user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: validEmail,
          password,
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      const body = response.body as {
        accessToken: string;
        user: { email: string };
      };
      expect(body).toHaveProperty('accessToken');
      expect(body.user.email).toBe(validEmail);

      // Verify refresh token cookie is set
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('refresh_token=');

      // Verify email verification token was sent
      expect(fakeEmailProvider.verificationEmails.length).toBe(1);
      expect(fakeEmailProvider.verificationEmails[0].email).toBe(validEmail);
    });

    it('should reject duplicate email registration', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: validEmail,
          password,
          firstName: 'Jane',
          lastName: 'Doe',
        })
        .expect(409);
    });

    it('should reject invalid email formatting', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password,
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);
    });

    it('should reject weak passwords', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'another@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);
    });

    it('should reject registration with missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'missing@example.com',
        })
        .expect(400);
    });
  });

  describe('Email Verification', () => {
    const email = 'verify@example.com';
    const password = 'StrongPassword123!';
    let token: string;

    beforeAll(async () => {
      // Register a user to generate the token
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Verify',
          lastName: 'Me',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      expect(emailRecord).toBeDefined();
      token = emailRecord!.token;
    });

    it('should reject an invalid verification token format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token-no-dot' })
        .expect(400);
    });

    it('should reject an expired verification token', async () => {
      const expiredSelector = 'exp-selector';
      const expiredSecret = 'exp-secret';
      const tokenHash = await passwordService.hashSecret(expiredSecret);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toBeDefined();

      await prisma.emailVerificationToken.create({
        data: {
          userId: user!.id,
          selector: expiredSelector,
          tokenHash,
          expiresAt: new Date(Date.now() - 10000), // expired
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: `${expiredSelector}.${expiredSecret}` })
        .expect(400);
    });

    it('should successfully verify user email with a valid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(204);

      const updatedUser = await prisma.user.findUnique({ where: { email } });
      expect(updatedUser?.emailVerifiedAt).not.toBeNull();
    });

    it('should reject reuse of an already used verification token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(400);
    });

    it('should allow double verification of a user who is already verified (idempotency check)', async () => {
      // Re-register or generate a new token for the verified user
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toBeDefined();

      const newSelector = 'new-selector';
      const newSecret = 'new-secret';
      const tokenHash = await passwordService.hashSecret(newSecret);

      await prisma.emailVerificationToken.create({
        data: {
          userId: user!.id,
          selector: newSelector,
          tokenHash,
          expiresAt: new Date(Date.now() + 100000),
        },
      });

      // Verify email verification is successful and user remains verified
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: `${newSelector}.${newSecret}` })
        .expect(204);
    });
  });

  describe('Login', () => {
    const email = 'login.user@example.com';
    const password = 'StrongPassword123!';
    let registeredUser: { id: string } | null;

    beforeAll(async () => {
      // Register, verify, and prepare the account
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Login',
          lastName: 'User',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: emailRecord!.token })
        .expect(204);

      registeredUser = await prisma.user.findUnique({ where: { email } });
    });

    it('should login successfully with valid credentials and return refresh cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('refresh_token=');
    });

    it('should reject login with incorrect password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123!' })
        .expect(401);
    });

    it('should reject login for a nonexistent account', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password })
        .expect(401);
    });

    it('should reject login for an inactive account', async () => {
      // Set user to SUSPENDED
      await prisma.user.update({
        where: { id: registeredUser!.id },
        data: { status: 'SUSPENDED' },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);

      // Restore status to ACTIVE
      await prisma.user.update({
        where: { id: registeredUser!.id },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('Refresh Token', () => {
    const email = 'refresh.user@example.com';
    const password = 'StrongPassword123!';
    let currentCookies: string[];

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Refresh',
          lastName: 'User',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: emailRecord!.token })
        .expect(204);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      currentCookies = loginRes.headers['set-cookie'] as unknown as string[];
    });

    it('should successfully refresh an authenticated session', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', currentCookies)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      const newCookies = response.headers['set-cookie'] as unknown as string[];
      expect(newCookies).toBeDefined();

      currentCookies = newCookies; // update cookie to the latest rotated version
    });

    it('should reject refresh if the session has expired', async () => {
      const user = await prisma.user.findUnique({ where: { email } });
      const expiredSession = await prisma.session.create({
        data: {
          userId: user!.id,
          refreshTokenHash: 'some-hash',
          expiresAt: new Date(Date.now() - 100000), // expired
        },
      });

      const expiredRefreshToken = await tokenService.generateRefreshToken({
        userId: user!.id,
        sessionId: expiredSession.id,
        rotationVersion: expiredSession.rotationVersion,
      });

      const expiredHash = await passwordService.hashSecret(expiredRefreshToken);
      await prisma.session.update({
        where: { id: expiredSession.id },
        data: { refreshTokenHash: expiredHash },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${expiredRefreshToken}`])
        .expect(401);
    });

    it('should reject refresh if the session has been revoked', async () => {
      const user = await prisma.user.findUnique({ where: { email } });
      const revokedSession = await prisma.session.create({
        data: {
          userId: user!.id,
          refreshTokenHash: 'some-hash',
          expiresAt: new Date(Date.now() + 100000),
          revokedAt: new Date(), // revoked
        },
      });

      const revokedRefreshToken = await tokenService.generateRefreshToken({
        userId: user!.id,
        sessionId: revokedSession.id,
        rotationVersion: revokedSession.rotationVersion,
      });

      const revokedHash = await passwordService.hashSecret(revokedRefreshToken);
      await prisma.session.update({
        where: { id: revokedSession.id },
        data: { refreshTokenHash: revokedHash },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${revokedRefreshToken}`])
        .expect(401);
    });

    it('should rotate tokens and reject reuse of old refresh tokens (with revocation)', async () => {
      // currentCookies holds the valid cookie from our first test.
      const oldCookies = [...currentCookies];

      // Step 1: Refresh first time -> Rotates token to new cookies.
      const firstRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookies)
        .expect(200);

      const rotatedCookies = firstRefresh.headers[
        'set-cookie'
      ] as unknown as string[];

      // Step 2: Try to reuse old refresh token (oldCookies) -> Expect 401.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookies)
        .expect(401);

      // Step 3: Verify that the rotatedCookies are now ALSO invalid (revoked because of reuse detection)
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookies)
        .expect(401);
    });
  });

  describe('Logout', () => {
    const email = 'logout.user@example.com';
    const password = 'StrongPassword123!';
    let accessToken: string;
    let cookies: string[];

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Logout',
          lastName: 'User',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: emailRecord!.token })
        .expect(204);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      const body = loginRes.body as { accessToken: string };
      accessToken = body.accessToken;
      cookies = loginRes.headers['set-cookie'] as unknown as string[];
    });

    it('should reject logout with an invalid access token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should logout successfully, revoke session and clear cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify cookie cleared (Max-Age=0 or Expires in past)
      const clearCookies = response.headers[
        'set-cookie'
      ] as unknown as string[];
      expect(clearCookies).toBeDefined();
      expect(clearCookies[0]).toMatch(
        /refresh_token=;?.*(?:Max-Age=0|Expires=)/i,
      );

      // Verify that refreshing with the old cookie now fails
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies)
        .expect(401);
    });
  });

  describe('Password Actions', () => {
    const email = 'password.actions@example.com';
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword123!';
    let accessToken: string;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: oldPassword,
          firstName: 'Password',
          lastName: 'Actions',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: emailRecord!.token })
        .expect(204);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(200);

      const body = loginRes.body as { accessToken: string };
      accessToken = body.accessToken;
    });

    it('should reject changing password to the same password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: oldPassword,
          newPassword: oldPassword,
        })
        .expect(400);
    });

    it('should reject changing password with incorrect current password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'IncorrectPassword123!',
          newPassword,
        })
        .expect(400);
    });

    it('should successfully change password with correct current password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: oldPassword,
          newPassword,
        })
        .expect(204);
    });

    it('should ensure the old password is now invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(401);
    });

    it('should successfully login with the new password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });

  describe('Password Reset Flow', () => {
    const email = 'reset.flow@example.com';
    const password = 'OldPassword123!';
    const newPassword = 'NewPassword123!';
    let activeSessionCookies: string[];

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Reset',
          lastName: 'Flow',
        })
        .expect(201);

      const emailRecord = fakeEmailProvider.verificationEmails.find(
        (e) => e.email === email,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: emailRecord!.token })
        .expect(204);

      // Create an active session to test session invalidation later
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      activeSessionCookies = loginRes.headers[
        'set-cookie'
      ] as unknown as string[];
    });

    it('should trigger forgot password reset email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      // Verify reset token was sent to the email
      const resetMail = fakeEmailProvider.passwordResetEmails.find(
        (m) => m.email === email,
      );
      expect(resetMail).toBeDefined();
    });

    it('should reject reset-password with an invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-token-no-dot', password: newPassword })
        .expect(400);
    });

    it('should reject reset-password with an expired token', async () => {
      const expiredSelector = 'reset-exp-selector';
      const expiredSecret = 'reset-exp-secret';
      const tokenHash = await passwordService.hashSecret(expiredSecret);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toBeDefined();

      await prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          selector: expiredSelector,
          tokenHash,
          expiresAt: new Date(Date.now() - 10000), // expired
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: `${expiredSelector}.${expiredSecret}`,
          password: newPassword,
        })
        .expect(400);
    });

    it('should successfully reset password with valid token and invalidate old sessions', async () => {
      const resetMail = fakeEmailProvider.passwordResetEmails.find(
        (m) => m.email === email,
      );
      expect(resetMail).toBeDefined();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetMail!.token, password: newPassword })
        .expect(204);

      // Verify old sessions are invalidated (calling refresh with activeSessionCookies should fail)
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', activeSessionCookies)
        .expect(401);
    });

    it('should reject reuse of an already used reset token', async () => {
      const resetMail = fakeEmailProvider.passwordResetEmails.find(
        (m) => m.email === email,
      );
      expect(resetMail).toBeDefined();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetMail!.token, password: newPassword })
        .expect(400);
    });

    it('should successfully login with the newly reset password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });
});
