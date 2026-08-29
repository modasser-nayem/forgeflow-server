import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordService } from '../../infrastructure/password/password.service';
import { RandomTokenService } from '../../infrastructure/token/random-token.service';

@Injectable()
export class PasswordResetService {
  private readonly tokenLifetimeMs = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly randomTokenService: RandomTokenService,
  ) {}

  async createToken(userId: string): Promise<string> {
    const selector = this.randomTokenService.generateSelector();

    const secret = this.randomTokenService.generate();

    const tokenHash = await this.passwordService.hashSecret(secret);

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        selector,
        tokenHash,
        expiresAt: new Date(Date.now() + this.tokenLifetimeMs),
      },
    });

    return `${selector}.${secret}`;
  }

  async consumeToken(token: string): Promise<{
    tokenId: string;
    userId: string;
  }> {
    const [selector, secret] = token.split('.');

    if (!selector || !secret) {
      throw new Error('Invalid reset token');
    }

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: {
        selector,
      },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!resetToken) {
      throw new Error('Invalid reset token');
    }

    if (resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new Error('Invalid reset token');
    }

    const valid = await this.passwordService.verifySecret(
      resetToken.tokenHash,
      secret,
    );

    if (!valid) {
      throw new Error('Invalid reset token');
    }

    return {
      tokenId: resetToken.id,
      userId: resetToken.userId,
    };
  }
}
