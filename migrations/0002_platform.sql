CREATE TABLE platform_access (
 email TEXT PRIMARY KEY NOT NULL,
 enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE throttle (
 key TEXT PRIMARY KEY NOT NULL,
 count INTEGER NOT NULL CHECK (count > 0),
 expires_at INTEGER NOT NULL
);
CREATE INDEX throttle_expiry ON throttle(expires_at);
-- Defense in depth: access checks and insertion are atomic even during revocation.
CREATE TRIGGER require_member_user BEFORE INSERT ON user
WHEN NOT EXISTS (SELECT 1 FROM platform_access WHERE email=lower(NEW.email) AND enabled=1)
BEGIN SELECT RAISE(ABORT, 'ACCESS_DENIED'); END;
CREATE TRIGGER require_member_session BEFORE INSERT ON session
WHEN NOT EXISTS (SELECT 1 FROM user JOIN platform_access ON platform_access.email=lower(user.email) WHERE user.id=NEW.userId AND platform_access.enabled=1)
BEGIN SELECT RAISE(ABORT, 'ACCESS_DENIED'); END;
