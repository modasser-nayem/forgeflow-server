import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  rotationVersion: number; // for detect rotate token
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  rotationVersion: number;
  type: 'refresh';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateAccessToken(data: {
    userId: string;
    sessionId: string;
    rotationVersion: number;
  }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: data.userId,
      sessionId: data.sessionId,
      rotationVersion: data.rotationVersion,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) as any,
    });
  }

  async generateRefreshToken(data: {
    userId: string;
    sessionId: string;
    rotationVersion: number;
  }): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: data.userId,
      sessionId: data.sessionId,
      rotationVersion: data.rotationVersion,
      type: 'refresh',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_REFRESH_EXPIRES_IN',
      ) as any,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }
}
