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
import { LogoutAllDeviceUseCase } from './application/use-cases/logout-all.use-case';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenService,
    RegisterUserUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllDeviceUseCase,
  ],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
