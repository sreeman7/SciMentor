-- Each private message has one recipient. Only that recipient can mark it read.
BEGIN;
ALTER TABLE scimentor.messages ADD COLUMN IF NOT EXISTS read_at bigint;
COMMIT;
