export interface EmailProvider {
  sendVerificationEmail(email: string, token: string): Promise<void>;

  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}
