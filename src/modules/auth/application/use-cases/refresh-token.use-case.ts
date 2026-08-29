import { Injectable, UnauthorizedException } from '@nestjs/common';

import { RefreshTokenDto } from '../../presentation/dto/refresh-token.dto';
import {
  RefreshTokenPayload,
  TokenService,
} from '../../infrastructure/token/token.service';
import { SessionService } from '../services/session.service';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly sessionService: SessionService,
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

    const session = await this.sessionService.rotate(
      payload.sub,
      payload.sessionId,
      dto.refreshToken,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }
}
