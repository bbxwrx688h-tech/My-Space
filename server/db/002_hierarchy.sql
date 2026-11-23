-- Existing users retain their accounts and can be assigned a supervisor later.
ALTER TABLE people DROP CONSTRAINT people_role_check;
ALTER TABLE people ADD CONSTRAINT people_role_check CHECK (role IN ('user','manager','boss','admin'));
ALTER TABLE people ADD COLUMN supervisor_id integer REFERENCES people(id);
ALTER TABLE people ADD CONSTRAINT people_not_own_supervisor CHECK (supervisor_id IS NULL OR supervisor_id <> id);
CREATE INDEX people_supervisor ON people(supervisor_id);
