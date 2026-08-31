export abstract class EmailProvider {
  abstract sendVerificationEmail(email: string, token: string): Promise<void>;

  abstract sendPasswordResetEmail(email: string, token: string): Promise<void>;
}
