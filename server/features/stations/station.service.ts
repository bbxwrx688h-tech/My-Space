import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Person } from '../../../shared/model';
import { changeDaysBody, publishOfferBody } from '../../../shared/contracts/station';
import { NotificationService } from '../../common/notifications/notification.service';
import { messages } from '../../common/notifications/messages';
import { transaction } from '../../db/connection';
import { stationFields } from '../../../shared/contracts/common';
import { today } from '../../../shared/time';
import { parse } from '../../common/validation/parse';
import { addStation } from '../../stations/station';

/** Station registration, offer publishing and day booking workflows. */
@Injectable()
export class StationService {
  constructor(private readonly notifications: NotificationService) {}

  create(me: Person, body: unknown) {
    const station = parse(stationFields, body);
    return transaction((db) => addStation(db, me.id, station));
  }

  publish(me: Person, body: unknown) {
    const { stationId, start, end, note } = parse(publishOfferBody, body);
    if (start < today() || end < start) throw new BadRequestException('טווח התאריכים אינו תקין');
    return transaction(async (db) => {
      const station = await db.query('SELECT owner_id FROM stations WHERE id=$1', [stationId]);
      if (station.rows[0]?.owner_id !== me.id)
        throw new ForbiddenException('אפשר להציע רק עמדה שבבעלותך');
      const offer = await db.query(
        'INSERT INTO offers(station_id,note) VALUES ($1,$2) RETURNING id',
        [stationId, note],
      );
      const offerId = offer.rows[0].id;
      // Each offered day is separate, allowing partial booking and withdrawal.
      await db.query(
        `INSERT INTO offer_days(offer_id,station_id,day)
        SELECT $1,$2,$3::date+n FROM generate_series(0,$4::date-$3::date) n`,
        [offerId, stationId, start, end],
      );
      return { id: offerId };
    });
  }

  changeDays(me: Person, body: unknown) {
    const { action, offerId, days } = parse(changeDaysBody, body);
    if (days.some((day) => day < today()))
      throw new BadRequestException('ניתן לשנות רק ימים מהיום והלאה');
    return transaction(async (db) => {
      const offer = (
        await db.query(
          `SELECT s.owner_id,s.room,s.site FROM offers o
        JOIN stations s ON s.id=o.station_id WHERE o.id=$1`,
          [offerId],
        )
      ).rows[0];
      if (!offer) throw new NotFoundException('ההצעה לא נמצאה');
      if (action === 'withdraw' && me.id !== offer.owner_id)
        throw new ForbiddenException('רק הבעלים יכולים להסיר ימים');
      if (action === 'book' && me.id === offer.owner_id)
        throw new BadRequestException('זו העמדה שלך');
      // Station ownership and the employee's home site do not limit borrowing
      // another employee's station, including one at a different site.
      // A borrower can book different stations concurrently. Serialize their
      // multi-day writes before acquiring station-day locks in date order.
      if (action === 'book')
        await db.query('SELECT id FROM people WHERE id=$1 FOR NO KEY UPDATE', [me.id]);
      // Lock in date order. A multi-day request succeeds in full or rolls back.
      const { rows } = await db.query<{ day: string; borrower_id: number | null }>(
        `SELECT day::text,borrower_id
        FROM offer_days WHERE offer_id=$1 AND day=ANY($2::date[]) ORDER BY day FOR UPDATE`,
        [offerId, days],
      );
      if (rows.length !== days.length)
        throw new ConflictException('אחד הימים שנבחרו כבר אינו מוצע');
      if (action === 'withdraw') {
        // Notify each affected borrower before deleting the corresponding day.
        for (const row of rows) {
          if (row.borrower_id) {
            const day = DateTime.fromISO(row.day).toFormat('dd/MM/yy');
            await this.notifications.send(
              db,
              row.borrower_id,
              messages.stationBookingCanceled(offer.room, offer.site, day),
            );
          }
        }
        await db.query('DELETE FROM offer_days WHERE offer_id=$1 AND day=ANY($2::date[])', [
          offerId,
          days,
        ]);
      } else {
        if (action === 'release' && rows.some((row) => row.borrower_id !== me.id))
          throw new ForbiddenException('אפשר לשחרר רק הזמנות שלך');
        if (action === 'book' && rows.some((row) => row.borrower_id !== null))
          throw new ConflictException('אחד הימים כבר הוזמן');
        await db.query(
          'UPDATE offer_days SET borrower_id=$3 WHERE offer_id=$1 AND day=ANY($2::date[])',
          [offerId, days, action === 'book' ? me.id : null],
        );
        if (action === 'book') {
          // The owner's notice is written in the same transaction as the booking.
          const dates = [...days].sort().map((day) => DateTime.fromISO(day).toFormat('dd/MM/yy'));
          await this.notifications.send(
            db,
            offer.owner_id,
            messages.stationBooked(me.name, me.surname, offer.room, offer.site, dates),
            { type: 'offer', id: offerId },
          );
        }
      }
      return { ok: true };
    });
  }
}
