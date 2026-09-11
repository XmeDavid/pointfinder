\set ON_ERROR_STOP on
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM %I.%I;',
              table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
