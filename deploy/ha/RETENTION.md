# Recovery retention policy

Approved cleanup scope: September 10, 2026. No broad Docker prune or storage
age-delete jobs are permitted.

| Data | Retention and deletion gate |
| --- | --- |
| Live PostgreSQL data and live media | Never removed by maintenance retention. |
| pgBackRest source repository | Existing four full / seven differential backup policy; pgBackRest owns WAL expiry. |
| New encrypted Dokploy local exports | Seven daily, four weekly, three monthly restore points. Only this runner's verified complete exports qualify for pruning. |
| Mac Garage media versions | Preserve all current media; retain deleted/superseded media for at least 90 days. No automatic object deletion is enabled. |
| Mac Garage database repository archive | Preserve complete coherent restore manifests and all their referenced backup/WAL objects for at least 90 days. Never delete individual WAL objects merely by age. |
| Mac Garage control-plane copies | At least the same seven daily / four weekly / three monthly recovery points as the source exports. Existing append-only mirror does not delete automatically. |
| Final old upload-disk archive | Keep both trusted-host copies for at least 30 days, and until the live/media archive checks remain successful. No automatic expiry. |
| One-time migration/control-plane/TeamSpeak exports | Keep until their replacement recovery procedure has passed; no blanket age deletion. |
| Completed restore-test containers and volumes | Remove only explicitly inventoried, stopped successful tests with no other consumer. Preserve test reports; recover the data again from the verified backup repository if needed. |

Garage's 90-day policy is a **minimum retention window, not an enabled expiry
job**. A future garbage-collection pass must first select retained manifests,
mark every referenced object, preserve all current source versions, and only
then propose unreferenced candidates. Review the dry-run and test restoration
before deleting any archive objects. This prevents a seemingly harmless age
rule from breaking PostgreSQL point-in-time recovery.

The Mac archive workers stop copying below 5 GiB or 20% free disk space, and
the existing freshness/disk monitor emails on failures. Investigate those
alerts; never bypass the guard or delete live data to make a copy succeed.
Current archive age is less than 90 days, so no Garage recovery object is
eligible for this cleanup.

## September 10 cleanup evidence

All 314 legacy finished media files (2,108,158,576 bytes) were SHA-256 checked
against live Hetzner S3 and the latest Mac Garage archive. A separate compressed
copy also preserves abandoned chunk sessions. The private audit and retirement
metadata are in the operator's protected recovery directory, not this repo.

Seven completed restore containers and five dedicated test volumes were
removed after checking healthy backup monitors and excluding every other
container/Swarm consumer. Their root-private inspect metadata remains on each
host under `/var/backups/pointfinder-ha/completed-restore-tests-<host>.json`.
Production PGDATA, pgBackRest, Garage, and migration backup files were untouched.
The reconstructed Mac rehearsal repository was moved out of active snapshot
state into `/srv/pointfinder-s3/retired-rehearsals/restore-rehearsal-b21e347f1352`.
That parent is root-private; the move is recoverable and the files were not
deleted. Keep it at least 30 days alongside the rehearsal evidence.
