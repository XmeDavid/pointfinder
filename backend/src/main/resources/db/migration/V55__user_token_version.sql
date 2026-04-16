-- V54: Add token_version column to users so we can invalidate issued JWTs on
--      security-sensitive events (password reset, role change, force-logout).
--
-- Every issued access/refresh token embeds the user's token_version at mint
-- time. JwtAuthenticationFilter compares that claim against the live value in
-- the users table and rejects tokens whose version lags.
--
-- Default 0 means existing refresh tokens keep working until they organically
-- expire or the user triggers a bump (password reset, role change).
ALTER TABLE users
    ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
