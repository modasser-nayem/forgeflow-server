import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

import { AuthController } from './presentation/auth.controller';

import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';

import { PasswordService } from './infrastructure/password/password.service';
import { TokenService } from './infrastructure/token/token.service';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
import { SessionService } from './application/services/session.service';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { RandomTokenService } from './infrastructure/token/random-token.service';

import { PasswordResetService } from './application/services/password-reset.service';
import { EmailVerificationService } from './application/services/email-verification.service';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { EmailProvider } from '../notifications/application/interfaces/email-provider.interface';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordService,
    RandomTokenService,
    TokenService,
    SessionService,
    PasswordResetService,
    EmailVerificationService,
    RegisterUserUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    ChangePasswordUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    VerifyEmailUseCase,
    {
      provide: EmailProvider,
      useValue: {
        sendVerificationEmail: (email: string, token: string) => {
          console.log(
            `[Mock Email] Sending verification to ${email} with token: ${token}`,
          );
        },
        sendPasswordResetEmail: (email: string, token: string) => {
          console.log(
            `[Mock Email] Sending password reset to ${email} with token: ${token}`,
          );
        },
      },
    },
  ],
  exports: [
    PasswordService,
    TokenService,
    SessionService,
    PasswordResetService,
    EmailVerificationService,
  ],
})
export class AuthModule {}
