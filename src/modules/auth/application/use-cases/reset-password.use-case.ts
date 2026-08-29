import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordService } from '../../infrastructure/password/password.service';

import { SessionService } from '../services/session.service';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const [selector, secret] = token.split('.');

    if (!selector || !secret) {
      throw new BadRequestException('Invalid or expired reset token');
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
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const valid = await this.passwordService.verifySecret(
      resetToken.tokenHash,
      secret,
    );

    if (!valid) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          passwordHash,
        },
      }),

      this.prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);

    await this.sessionService.revokeForUser(resetToken.userId);
  }
}
