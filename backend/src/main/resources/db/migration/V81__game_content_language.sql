-- OW-33: the organizer-declared language of a game's own content (base
-- names, challenge text, documents), separate from the app's interface
-- language. NULL is an honest "unknown" for games created before this and
-- for organizers who did not say; it never means "any language".
ALTER TABLE games ADD COLUMN content_language VARCHAR(8);
