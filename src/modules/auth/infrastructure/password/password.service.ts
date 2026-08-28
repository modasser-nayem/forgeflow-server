import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return await argon2.hash(password);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return await argon2.verify(hash, password);
  }

  async hashSecret(secret: string): Promise<string> {
    return argon2.hash(secret);
  }

  async verifySecret(hash: string, secret: string): Promise<boolean> {
    return argon2.verify(hash, secret);
  }
}
