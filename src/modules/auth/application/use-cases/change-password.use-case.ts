import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma/prisma.service';

import { PasswordService } from '../../infrastructure/password/password.service';

import { SessionService } from '../services/session.service';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not available');
    }

    const valid = await this.passwordService.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });

    /*
     * Keep the current session alive,
     * revoke every other session.
     */
    await this.sessionService.revokeOtherSessions(userId, currentSessionId);
  }
}
