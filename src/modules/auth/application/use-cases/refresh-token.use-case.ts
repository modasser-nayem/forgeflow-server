import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';
import { PasswordService } from '../../infrastructure/password/password.service';
import { RefreshTokenDto } from '../../presentation/dto/refresh-token.dto';
import {
  RefreshTokenPayload,
  TokenService,
} from '../../infrastructure/token/token.service';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RefreshTokenDto) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.tokenService.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
      },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session has expired');
    }

    const tokenValid = await this.passwordService.verifySecret(
      session.refreshTokenHash,
      dto.refreshToken,
    );

    if (!tokenValid) {
      await this.prisma.session.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefreshToken = await this.tokenService.generateRefreshToken({
      userId: session.userId,
      sessionId: session.id,
    });

    const newAccessToken = await this.tokenService.generateAccessToken({
      userId: session.userId,
      sessionId: session.id,
    });

    const newRefreshTokenHash =
      await this.passwordService.hashSecret(newRefreshToken);

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}
