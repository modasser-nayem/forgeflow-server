import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordResetService } from '../services/password-reset.service';

import type { EmailProvider } from '../../../notifications/application/interfaces/email-provider.interface';

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailProvider: EmailProvider,
  ) {}

  async execute(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    /*
     * IMPORTANT:
     * We intentionally do not tell the caller
     * whether the account exists.
     */
    if (!user) {
      return;
    }

    if (user.status !== 'ACTIVE') {
      return;
    }

    /*
     * Invalidate existing reset tokens.
     *
     * This prevents multiple active reset links
     * from remaining valid.
     */
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const token = await this.passwordResetService.createToken(user.id);

    await this.emailProvider.sendPasswordResetEmail(user.email, token);
  }
}
