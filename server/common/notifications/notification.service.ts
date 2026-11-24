import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { notify } from '../../db/connection';

/** Injectable wrapper around the shared notice insert helper. */
@Injectable()
export class NotificationService {
  send(db: PoolClient, personId: number, message: string) {
    return notify(db, personId, message);
  }
}
