import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordService } from '../../infrastructure/password/password.service';
import { RandomTokenService } from '../../infrastructure/token/random-token.service';

@Injectable()
export class EmailVerificationService {
  private readonly tokenLifetimeMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly randomTokenService: RandomTokenService,
  ) {}

  async createToken(userId: string): Promise<string> {
    const selector = this.randomTokenService.generateSelector();

    const secret = this.randomTokenService.generate();

    const tokenHash = await this.passwordService.hashSecret(secret);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        selector,
        tokenHash,
        expiresAt: new Date(Date.now() + this.tokenLifetimeMs),
      },
    });

    return `${selector}.${secret}`;
  }
}
