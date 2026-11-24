import { PoolClient } from 'pg';
import { z } from 'zod';
import { stationFields } from '../../shared/contracts/common';

// Station creation is shared by onboarding and the station management page.
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
