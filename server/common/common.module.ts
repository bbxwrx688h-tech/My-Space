import { Global, Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session';
import { NotificationService } from './notifications/notification.service';

/** Cross-cutting providers shared by every feature module. */
@Global()
@Module({
  providers: [SessionGuard, NotificationService],
  exports: [SessionGuard, NotificationService],
})
export class CommonModule {}
