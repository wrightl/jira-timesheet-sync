CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
-- One-shot: hash existing plaintext session tokens. Do not re-apply.
UPDATE "sessions"
SET "token" = encode(digest("token", 'sha256'), 'hex');
