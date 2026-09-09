-- Sales-led club deals, step 1 of 2: introduce the `club` org tier value.
--
-- PostgreSQL will not let a transaction USE an enum value it added itself,
-- so this migration only widens the type. V65 migrates the rows and adds the
-- rest of the schema. The stale 'base' and 'high' labels stay in the type —
-- dropping an enum value requires rewriting the type and every column that
-- uses it, and after V65 no row and no Java constant references them.
ALTER TYPE org_tier ADD VALUE IF NOT EXISTS 'club';
