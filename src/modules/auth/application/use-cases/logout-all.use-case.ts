import { Injectable } from '@nestjs/common';

import { SessionService } from '../services/session.service';

@Injectable()
export class LogoutAllUseCase {
  constructor(private readonly sessionService: SessionService) {}

  async execute(userId: string): Promise<void> {
    await this.sessionService.revokeForUser(userId);
  }
}
