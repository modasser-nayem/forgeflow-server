import { RefreshTokenUseCase } from './../application/use-cases/refresh-token.use-case';
import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RegisterUserUseCase } from '../application/use-cases/register-user.use-case';
import type { Request, Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LoginDto } from './dto/login.dto';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { LogoutAllDeviceUseCase } from '../application/use-cases/logout-all.use-case';
import { AccessTokenGuard } from '../../../common/guards/access-token.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly logoutAllDeviceUseCase: LogoutAllDeviceUseCase,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.registerUserUseCase.execute(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    const { refreshToken, ...restData } = result;

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return restData;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginUseCase.execute(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    const { refreshToken, ...restData } = result;

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return restData;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokenFromCookie = req.cookies.refresh_token as string | undefined;

    if (!tokenFromCookie) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await this.refreshTokenUseCase.execute({
      refreshToken: tokenFromCookie,
    });

    const { refreshToken: newRefreshToken, ...restData } = result;

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return restData;
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.logoutUseCase.execute(user.userId, user.sessionId);

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return {
      message: 'Logged out successfully',
    };
  }

  @Post('logout-all')
  @UseGuards(AccessTokenGuard)
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.logoutAllDeviceUseCase.execute(user.userId);
  }
}
