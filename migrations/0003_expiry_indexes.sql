-- Platform-owned support indexes for bounded scheduled cleanup.
CREATE INDEX session_expiry ON session(expiresAt);
CREATE INDEX verification_expiry ON verification(expiresAt);
