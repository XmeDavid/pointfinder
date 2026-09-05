# Backend test migration — 2026-09-05

The full test source set now compiles against the current backend. Tests use
record accessors for response DTOs, the current GameService constructor, and
GameImportExportService for import/export. Entity getter calls remain unchanged.

Join behavior tests now exercise PlayerJoinService. Upload-linkage assertions
now exercise SubmissionService directly, preserving single/multiple media,
unrelated-file, text-only and idempotent replay cases. A player submission
orchestration test verifies the authenticated player/game scope, team identity,
file URLs and idempotency key passed to those services. Controller/security
test slices include the new service dependencies.

No production domain code, validation rules, API contracts or test-skip rules
were changed for this repair.

## Local result

```sh
JAVA_HOME="$HOME/.jdks/temurin-21" backend/gradlew -p backend test --console=plain
```

**923 discovered, 829 passed, 94 skipped, 0 failed.** The existing Docker
availability condition skips 94 database integration tests because this session
cannot access the Docker socket. Compilation includes those tests, but their
database behavior requires validation on CI or another Docker-enabled machine.
The earlier reports of backend test compilation failure are superseded by this
result. CI verification is pending at the time of this commit.

## Build fixes found during validation

- Docker CI exposed that `**/build` excluded `web/build` and
  `web/src/features/build`, both of which contain source. Explicit exceptions
  retain those directories while excluding generated build output.
- The reported iOS "PhaseScriptExecution" failure did not include its underlying
  error. Inspection confirmed invalid YAML in the checked-in XcodeGen template
  and a build phase relying on the GUI's PATH to find Bun. Both now call a shared
  shell wrapper with explicit user toolchain paths and the mobile working
  directory. Shell syntax and template parsing pass locally; Xcode/device
  validation still requires the Mac and the actual error log if it fails again.
