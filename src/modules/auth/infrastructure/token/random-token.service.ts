import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

@Injectable()
export class RandomTokenService {
  generate(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
  }

  generateSelector(): string {
    return randomBytes(16).toString('hex');
  }
}
