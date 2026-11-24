import { Global, Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session';

/** Cross-cutting providers shared by every feature module. */
@Global()
@Module({
  providers: [SessionGuard],
  exports: [SessionGuard],
})
export class CommonModule {}
