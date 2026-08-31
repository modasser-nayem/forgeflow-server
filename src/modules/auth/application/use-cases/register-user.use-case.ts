import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { PasswordService } from '../../infrastructure/password/password.service';
import { ConflictException, Injectable } from '@nestjs/common';
import { TokenService } from '../../infrastructure/token/token.service';
import { RegisterDto } from '../../presentation/dto/register.dto';
import { AuthResult } from '../types/auth-result.types';
import { EmailVerificationService } from '../services/email-verification.service';
import { EmailProvider } from '../../../notifications/application/interfaces/email-provider.interface';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly emailProvider: EmailProvider,
  ) {}

  async execute(
    dto: RegisterDto,
    metaData?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      const session = await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: '',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          userAgent: metaData?.userAgent,
          ipAddress: metaData?.ipAddress,
        },
      });

      const [accessToken, refreshToken] = await Promise.all([
        this.tokenService.generateAccessToken({
          userId: user.id,
          sessionId: session.id,
          rotationVersion: session.rotationVersion,
        }),
        this.tokenService.generateRefreshToken({
          userId: user.id,
          sessionId: session.id,
          rotationVersion: session.rotationVersion,
        }),
      ]);

      const refreshTokenHash =
        await this.passwordService.hashSecret(refreshToken);

      await tx.session.update({
        where: {
          id: session.id,
        },
        data: {
          refreshTokenHash,
        },
      });

      return {
        accessToken,
        refreshToken,
        user,
      };
    });

    const verificationToken = await this.emailVerificationService.createToken(
      result.user.id,
    );
    await this.emailProvider.sendVerificationEmail(
      result.user.email,
      verificationToken,
    );

    return result;
  }
}
