-- Local accounts remain administrators, while employee accounts may also be administrators.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint
  WHERE conrelid = 'people'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source%local%role%admin%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE people DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
ALTER TABLE people ADD CONSTRAINT people_local_admin CHECK (source <> 'local' OR role = 'admin');
