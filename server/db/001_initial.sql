CREATE TABLE people (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('local','dev','adfs')),
  upn text NOT NULL,
  name text NOT NULL,
  surname text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','boss','admin')),
  site text CHECK (site IN ('MBT','MID','MARP')),
  password_hash text,
  UNIQUE (source, upn),
  CHECK ((source = 'local') = (role = 'admin')),
  CHECK ((source = 'local') = (password_hash IS NOT NULL))
);
CREATE TABLE sessions (
  digest text PRIMARY KEY,
  person_id integer NOT NULL REFERENCES people,
  expires timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);

CREATE TABLE rooms (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site text NOT NULL CHECK (site IN ('MBT','MID','MARP')),
  name text NOT NULL,
  UNIQUE (site, name)
);
INSERT INTO rooms(site, name) VALUES ('MID', 'חדר ישיבות');
CREATE TABLE meetings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms,
  organizer_id integer NOT NULL REFERENCES people,
  title text NOT NULL,
  description text NOT NULL,
  starts timestamptz NOT NULL,
  ends timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  CHECK (starts < ends)
);
CREATE INDEX meetings_room_start ON meetings(room_id, starts);
CREATE INDEX meetings_organizer_end ON meetings(organizer_id, ends);

CREATE TABLE stations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES people,
  site text NOT NULL CHECK (site IN ('MBT','MID','MARP')),
  room text NOT NULL,
  os text NOT NULL CHECK (os IN ('Windows','Linux')),
  description text NOT NULL
);
CREATE TABLE offers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id integer NOT NULL REFERENCES stations,
  note text NOT NULL DEFAULT '',
  UNIQUE(id, station_id)
);
-- A row exists only while this day is offered. Releasing a booking clears
-- borrower_id. Withdrawing the offer removes the row altogether.
CREATE TABLE offer_days (
  offer_id integer NOT NULL,
  station_id integer NOT NULL,
  day date NOT NULL,
  borrower_id integer REFERENCES people,
  PRIMARY KEY(station_id, day),
  FOREIGN KEY(offer_id, station_id) REFERENCES offers(id, station_id)
);
CREATE INDEX offer_days_offer ON offer_days(offer_id, day);
CREATE UNIQUE INDEX one_station_per_person_day ON offer_days(borrower_id, day)
  WHERE borrower_id IS NOT NULL;
CREATE TABLE notices (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id integer NOT NULL REFERENCES people,
  message text NOT NULL,
  created timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false
);
CREATE INDEX notices_recipient ON notices(person_id, id DESC);
