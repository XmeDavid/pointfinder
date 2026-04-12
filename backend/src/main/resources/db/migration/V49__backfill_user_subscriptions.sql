-- V49__backfill_user_subscriptions.sql

INSERT INTO user_subscriptions (user_id, tier, status)
SELECT id, 'free', 'active'
FROM users
WHERE id NOT IN (SELECT user_id FROM user_subscriptions);
