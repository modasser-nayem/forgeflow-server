import { Injectable } from '@nestjs/common';

import { SessionService } from '../services/session.service';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly sessionService: SessionService) {}

  async execute(userId: string, sessionId: string): Promise<void> {
    await this.sessionService.revoke(userId, sessionId);
  }
}
