import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { Person } from '../../shared/model';
import { Employee, SessionGuard } from '../auth/session';
import { notify, transaction } from '../db/connection';
import { date, id, parse, selectedDays, stationFields, today } from '../validation';

export async function addStation(
  db: PoolClient,
  owner: number,
  station: z.infer<typeof stationFields>,
) {
  const { site, room, os, description } = station;
  return (
    await db.query(
      'INSERT INTO stations(owner_id,site,room,os,description) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [owner, site, room, os, description],
    )
  ).rows[0];
}

@Controller('stations')
@UseGuards(SessionGuard)
export class StationsController {
  @Post() create(@Employee() me: Person, @Body() body: unknown) {
    const station = parse(stationFields, body);
    return transaction((db) => addStation(db, me.id, station));
  }

  @Post('offers') publish(@Employee() me: Person, @Body() body: unknown) {
    const { stationId, start, end, note } = parse(
      z.object({ stationId: id, start: date, end: date, note: z.string().trim().max(2000) }),
      body,
    );
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
      await db.query(
        `INSERT INTO offer_days(offer_id,station_id,day)
        SELECT $1,$2,$3::date+n FROM generate_series(0,$4::date-$3::date) n`,
        [offerId, stationId, start, end],
      );
      return { id: offerId };
    });
  }

  @Post('days') changeDays(@Employee() me: Person, @Body() body: unknown) {
    const { action, offerId, days } = parse(
      z.object({
        action: z.enum(['book', 'release', 'withdraw']),
        offerId: id,
        days: selectedDays,
      }),
      body,
    );
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
        for (const row of rows) {
          if (row.borrower_id) {
            const day = DateTime.fromISO(row.day).toFormat('dd/MM/yy');
            await notify(
              db,
              row.borrower_id,
              `העמדה בחדר ${offer.room} באתר ${offer.site} הוסרה מתאריך ${day}. ההזמנה בוטלה.`,
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
          const dates = [...days].sort().map((day) => DateTime.fromISO(day).toFormat('dd/MM/yy'));
          await notify(
            db,
            offer.owner_id,
            `${me.name} ${me.surname} הזמין/ה את העמדה בחדר ${offer.room} באתר ${offer.site} לתאריכים ${dates.join(', ')}.`,
          );
        }
      }
      return { ok: true };
    });
  }
}
