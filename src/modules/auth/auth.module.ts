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

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordService,
    RandomTokenService,
    TokenService,
    SessionService,
    RegisterUserUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    ChangePasswordUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
  ],
  exports: [PasswordService, TokenService, SessionService],
})
export class AuthModule {}
