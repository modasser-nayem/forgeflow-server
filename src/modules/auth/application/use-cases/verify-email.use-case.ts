import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordService } from '../../infrastructure/password/password.service';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(token: string): Promise<void> {
    const [selector, secret] = token.split('.');

    if (!selector || !secret) {
      throw new BadRequestException('Invalid verification token');
    }

    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
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

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (tokenRecord.usedAt || tokenRecord.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const valid = await this.passwordService.verifySecret(
      tokenRecord.tokenHash,
      secret,
    );

    if (!valid) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: tokenRecord.userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      }),

      this.prisma.emailVerificationToken.update({
        where: {
          id: tokenRecord.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);
  }
}
