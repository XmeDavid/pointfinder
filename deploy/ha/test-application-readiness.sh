#!/usr/bin/env bash
# Local isolated verification only: no production access or deployment.
set -euo pipefail
pointfinder_test_root="${1:-$(git rev-parse --show-toplevel)}"
cd "$pointfinder_test_root"
docker compose -p pointfinder-ha-verification -f docker-compose.test.yml run --rm backend-test \
  ./gradlew test --no-daemon \
  --tests 'com.prayer.pointfinder.integration.ha.*' \
  --tests '*GameSchedulerServiceTest' --tests '*ChunkedUploadServiceTest' \
  --tests '*LoginAttemptServiceTest' --tests '*GameEventBroadcasterTest' \
  --tests '*OperatorPresenceTrackerTest' --tests '*ThumbnailServiceTest' \
  --tests '*PlayerJoinServiceTest' --tests '*BroadcastServiceTest' \
  --tests '*StompSessionMetricsListenerTest' --tests '*MobileRealtimeHubMetricsTest' \
  --tests '*RealtimeOutboxWriterTest' --tests '*FileStorageServiceTest' \
  --tests '*ObjectStoragePaginationTest' --tests '*SubmissionUploadLinkageTest' \
  --tests '*SubmissionFlowIntegrationTest' --tests '*JoinAndFileAccessSecurityIntegrationTest' \
  --tests '*GameStateVersionConcurrencyTest' bootJar
