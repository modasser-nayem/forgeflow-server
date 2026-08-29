import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { PasswordService } from '../../infrastructure/password/password.service';
import { TokenService } from '../../infrastructure/token/token.service';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class SessionService {
  private readonly refreshTokenLifetimeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async create(
    userId: string,
    metadata?: SessionMetadata,
  ): Promise<CreateSessionResult> {
    const session = await this.prisma.session.create({
      data: {
        userId: userId,
        refreshTokenHash: '',
        expiresAt: new Date(Date.now() + this.refreshTokenLifetimeMs),
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.generateAccessToken({
        userId,
        sessionId: session.id,
        rotationVersion: session.rotationVersion,
      }),
      this.tokenService.generateRefreshToken({
        userId,
        sessionId: session.id,
        rotationVersion: session.rotationVersion,
      }),
    ]);

    const refreshTokenHash =
      await this.passwordService.hashSecret(refreshToken);

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
    };
  }

  async rotate(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
        rotationVersion: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.userId !== userId) {
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
      refreshToken,
    );

    if (!tokenValid) {
      await this.revoke(session.userId, session.id);

      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRotationVersion = session.rotationVersion + 1;

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.tokenService.generateAccessToken({
        userId,
        sessionId,
        rotationVersion: nextRotationVersion,
      }),
      this.tokenService.generateRefreshToken({
        userId,
        sessionId,
        rotationVersion: nextRotationVersion,
      }),
    ]);

    const newRefreshTokenHash =
      await this.passwordService.hashSecret(newRefreshToken);

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        rotationVersion: nextRotationVersion,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async revoke(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
