-- Existing meetings remain public, non-visit single occurrences.
ALTER TABLE meetings ADD COLUMN private boolean NOT NULL DEFAULT false;
ALTER TABLE meetings ADD COLUMN visit boolean NOT NULL DEFAULT false;
CREATE TABLE meeting_series (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id integer NOT NULL REFERENCES people(id),
  created timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meetings ADD COLUMN series_id integer REFERENCES meeting_series(id);
CREATE INDEX meetings_series ON meetings(series_id,starts) WHERE series_id IS NOT NULL;

-- A request holds its proposed slots until rejected, expired or completed.
CREATE TABLE meeting_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id integer NOT NULL REFERENCES people(id),
  kind text NOT NULL CHECK (kind IN ('booking','takeover','edit','boss_edit','series_edit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','invalidated','cancelled')),
  title text NOT NULL,
  description text NOT NULL,
  private boolean NOT NULL DEFAULT false,
  visit boolean NOT NULL DEFAULT false,
  recurring boolean NOT NULL DEFAULT false,
  target_meeting_id integer,
  target_version integer,
  expires timestamptz NOT NULL,
  created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_requests_pending_expiry ON meeting_requests(expires) WHERE status='pending';
CREATE TABLE meeting_request_slots (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id integer NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  room_id integer NOT NULL REFERENCES rooms(id),
  starts timestamptz NOT NULL,
  ends timestamptz NOT NULL,
  target_meeting_id integer,
  target_version integer,
  target_organizer_id integer REFERENCES people(id),
  CHECK ((target_meeting_id IS NULL AND target_version IS NULL AND target_organizer_id IS NULL)
      OR (target_meeting_id IS NOT NULL AND target_version IS NOT NULL AND target_organizer_id IS NOT NULL)),
  CHECK (starts < ends)
);
CREATE INDEX meeting_request_slots_room ON meeting_request_slots(room_id,starts,ends);
CREATE INDEX meeting_request_slots_target ON meeting_request_slots(target_meeting_id) WHERE target_meeting_id IS NOT NULL;
CREATE TABLE meeting_request_approvals (
  request_id integer NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES people(id),
  approved boolean NOT NULL DEFAULT false,
  PRIMARY KEY(request_id,person_id)
);
CREATE INDEX meeting_request_approvals_person ON meeting_request_approvals(person_id,request_id);
-- Snapshot IDs and versions so approval cannot cancel a meeting changed since review.
CREATE TABLE meeting_request_conflicts (
  request_id integer NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  meeting_id integer NOT NULL,
  version integer NOT NULL,
  organizer_id integer NOT NULL REFERENCES people(id),
  organizer_role text NOT NULL,
  PRIMARY KEY(request_id,meeting_id)
);
CREATE INDEX meeting_request_conflicts_meeting ON meeting_request_conflicts(meeting_id,request_id);
CREATE TABLE meeting_request_invitees (
  request_id integer NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES people(id),
  PRIMARY KEY(request_id,person_id)
);
CREATE TABLE meeting_invitations (
  meeting_id integer NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES people(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  PRIMARY KEY(meeting_id,person_id)
);
CREATE INDEX meeting_invitations_person ON meeting_invitations(person_id,status,meeting_id);

-- Release and swap proposals retain both original bookings until approval.
CREATE TABLE meeting_exchange_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('release','swap')),
  requester_id integer NOT NULL REFERENCES people(id),
  first_meeting_id integer NOT NULL,
  first_version integer NOT NULL,
  first_owner_id integer NOT NULL REFERENCES people(id),
  second_meeting_id integer,
  second_version integer,
  second_owner_id integer REFERENCES people(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','invalidated')),
  expires timestamptz NOT NULL,
  created timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='release' AND second_meeting_id IS NULL AND second_version IS NULL AND second_owner_id IS NULL)
      OR (kind='swap' AND second_meeting_id IS NOT NULL AND second_version IS NOT NULL AND second_owner_id IS NOT NULL AND first_meeting_id<>second_meeting_id))
);
CREATE INDEX meeting_exchange_pending_expiry ON meeting_exchange_requests(expires) WHERE status='pending';
CREATE TABLE meeting_exchange_approvals (
  request_id integer NOT NULL REFERENCES meeting_exchange_requests(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES people(id),
  approved boolean NOT NULL DEFAULT false,
  PRIMARY KEY(request_id,person_id)
);
CREATE INDEX meeting_exchange_approvals_person ON meeting_exchange_approvals(person_id,request_id);
