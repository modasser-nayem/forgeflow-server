import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { PasswordService } from '../../infrastructure/password/password.service';
import { AuthResult } from '../types/auth-result.types';
import { LoginDto } from '../../presentation/dto/login.dto';
import { SessionMetadata, SessionService } from '../services/session.service';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(
    dto: LoginDto,
    metaData?: SessionMetadata,
  ): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or Password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not available');
    }

    const session = await this.sessionService.create(user.id, metaData);

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }
}
