ALTER TABLE users
ADD COLUMN push_token VARCHAR(255),
ADD COLUMN push_platform VARCHAR(32) NOT NULL DEFAULT 'ios';

CREATE INDEX idx_users_push_token ON users (push_token);
CREATE INDEX idx_users_push_platform ON users (push_platform);

CREATE TABLE operator_notification_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id                     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notify_pending_submissions  BOOLEAN NOT NULL DEFAULT true,
    notify_all_submissions      BOOLEAN NOT NULL DEFAULT false,
    notify_check_ins            BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (game_id, user_id)
);

CREATE INDEX idx_operator_notification_settings_game
    ON operator_notification_settings (game_id);

CREATE INDEX idx_operator_notification_settings_user
    ON operator_notification_settings (user_id);

