# Database Deployment Strategy

> Phase: DR-1  
> Decision date: 2026-09-13  
> MVP decision: keep SQLite. Do not migrate to PostgreSQL in this phase.

## MVP data platform

The application uses SQLite through `better-sqlite3`. The database file is defined by `DB_PATH` and defaults to `backend/chenguang.db`. WAL mode is enabled at startup. All user application data is stored in one `user_data` row per user.

SQLite remains appropriate for the current MVP because:

- deployment is intentionally single-node;
- writes are low-volume and user-scoped;
- operational cost must stay low;
- there is no requirement for concurrent app instances.

## Required production configuration

The backend must run as exactly one instance against a persistent disk.

Recommended settings:

| Variable | Value |
|---|---|
| `DB_PATH` | `/var/data/chenguang.db` |
| Persistent mount | `/var/data` |
| Instances | `1` |

The persistent disk must survive restarts, redeploys, and container replacement. The database and its WAL/SHM side files must remain on the same persistent mount.

Platform requirements:

- use Render/Fly.io/Railway/VPS with a real persistent volume;
- do not deploy the stateful backend to an ephemeral serverless filesystem;
- mount the same disk for every backend instance;
- do not horizontally scale SQLite behind multiple app containers.

## Backup policy

1. Schedule a periodic filesystem snapshot of the persistent disk.
2. Prefer a SQLite-safe backup method, for example `sqlite3 "$DB_PATH" ".backup '/var/data/chenguang-backup.db'"`.
3. Retain at least seven daily backups and four weekly backups.
4. Test restore quarterly into an isolated environment.

If a backup tool cannot coordinate with SQLite, stop the single backend instance briefly, snapshot the database and WAL files, then restart.

## Future PostgreSQL migration

PostgreSQL is not required for MVP. It becomes appropriate when one of the following is true:

- multiple backend instances are needed;
- concurrent write contention becomes visible;
- cross-user reporting or administrative queries become important;
- transactional durability beyond a single persistent disk is required.

The migration should proceed in explicit stages:

1. Add versioned schema migrations for PostgreSQL.
2. Replace SQLite-specific SQL in the data access layer while preserving the existing service contracts.
3. Add a read-only compatibility test suite for PostgreSQL.
4. Run SQLite and PostgreSQL in parallel behind the same service contract.
5. Verify row counts and integrity checks.
6. Switch writes to PostgreSQL only after validation.
7. Keep SQLite as a rollback source for a defined retention window.

No migration should be started during DR-1.
