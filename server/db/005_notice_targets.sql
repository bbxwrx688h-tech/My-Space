-- Optional targets preserve older notifications and survive deletion of their subject.
ALTER TABLE notices ADD COLUMN target_type text CHECK (target_type IN ('request', 'exchange', 'invitation', 'offer'));
ALTER TABLE notices ADD COLUMN target_id integer CHECK (target_id > 0);
ALTER TABLE notices ADD CONSTRAINT notices_target_pair CHECK ((target_type IS NULL) = (target_id IS NULL));
