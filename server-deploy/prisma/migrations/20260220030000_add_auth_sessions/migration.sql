CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "ip_address" TEXT,
  "expires_at" DATETIME NOT NULL,
  "revoked_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "auth_sessions_user_id_expires_at_idx"
ON "auth_sessions"("user_id", "expires_at");

CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key"
ON "auth_sessions"("refresh_token_hash");
