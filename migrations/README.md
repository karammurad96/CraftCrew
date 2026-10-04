# Database migrations

SQL files for the PostgreSQL store (`STORE=postgres`), applied in order by `db/migrate.js`: at server start-up,
or by hand with `node tools/db/migrate.js`. `schema_migrations` records which ones ran.

- Name them `NNN_short_name.sql`, numbered without gaps: `001_records.sql`, `002_users.sql` …
- Each file runs in its own transaction, so don't write `begin` or `commit` in it. If any statement fails,
  the whole file is rolled back and the start-up stops.
- **A merged migration is never edited.** A change is a new file.
- Keep the current ids as `text` primary keys, money as `numeric(12,2)`, times as `timestamptz`, and fields not
  yet modelled as columns in an `extra jsonb` column.
