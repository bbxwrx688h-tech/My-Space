import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { notify, NoticeTarget } from '../../db/connection';

/** Injectable wrapper around the shared notice insert helper. */
@Injectable()
export class NotificationService {
  send(db: PoolClient, personId: number, message: string, target?: NoticeTarget) {
    return notify(db, personId, message, target);
  }
}
