-- Finding 10.11: Mirror the V56 fix for the users table.
-- V6 added push_platform to users with NOT NULL DEFAULT 'ios'. Operators
-- on Android who register a push token always set the platform explicitly
-- (UserService.updatePushToken), but the stale default causes any user row
-- created without an explicit pushPlatform to silently default to 'ios',
-- which means OperatorPushNotificationService would route their pushes to
-- APNs instead of FCM. Make the column nullable with no default, matching
-- the Player entity change from V30+V56.
ALTER TABLE users ALTER COLUMN push_platform DROP NOT NULL;
ALTER TABLE users ALTER COLUMN push_platform DROP DEFAULT;
