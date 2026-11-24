import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { transaction } from '../../db/connection';
import { withRequestExpiry } from '../../meetings/requests';

/** Releases expired holds even when nobody has opened the calendar recently. */
@Injectable()
export class ExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  onModuleInit() {
    this.timer = setInterval(() => {
      void transaction(async (db) => {
        await withRequestExpiry(db, async () => {});
      }).catch((error: Error) => console.error('Meeting request expiry failed:', error.message));
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
