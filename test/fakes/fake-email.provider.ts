import { EmailProvider } from '../../src/modules/notifications/application/interfaces/email-provider.interface';

export class FakeEmailProvider implements EmailProvider {
  verificationEmails: Array<{
    email: string;
    token: string;
  }> = [];

  passwordResetEmails: Array<{
    email: string;
    token: string;
  }> = [];

  sendVerificationEmail(email: string, token: string): Promise<void> {
    this.verificationEmails.push({
      email,
      token,
    });
    return Promise.resolve();
  }

  sendPasswordResetEmail(email: string, token: string): Promise<void> {
    this.passwordResetEmails.push({
      email,
      token,
    });
    return Promise.resolve();
  }
}
