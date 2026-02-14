TEST_COMPOSE_FILE ?= docker-compose.test.yml
DOCKER_COMPOSE ?= docker compose

IOS_PROJECT ?= ios-app/dbv-nfc-games.xcodeproj
IOS_SCHEME ?= dbv-nfc-games
IOS_DESTINATION ?= platform=iOS Simulator,name=iPhone 17
ANDROID_PROJECT ?= android-app
ANDROID_GRADLEW ?= android-app/gradlew

.PHONY: help check-docker check-xcode check-android-gradle test-backend-docker test-frontend-docker test-docker test-ios test-android test-all

help:
	@echo "Available targets:"
	@echo "  test-backend-docker  Run backend tests in Docker"
	@echo "  test-frontend-docker Run frontend lint + tests in Docker"
	@echo "  test-docker          Run backend + frontend Docker tests"
	@echo "  test-ios             Run iOS tests on macOS host (xcodebuild)"
	@echo "  test-android         Run Android JVM/unit checks via Gradle"
	@echo "  test-all             Run docker, Android, and iOS tests"

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "docker is required for Docker-based tests."; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "docker compose plugin is required."; exit 1; }

check-xcode:
	@command -v xcodebuild >/dev/null 2>&1 || { echo "xcodebuild is required for iOS tests. Install Xcode and select the developer directory."; exit 1; }

check-android-gradle:
	@test -x "$(ANDROID_GRADLEW)" || { echo "$(ANDROID_GRADLEW) not found or not executable."; exit 1; }

test-backend-docker: check-docker
	@$(DOCKER_COMPOSE) -f $(TEST_COMPOSE_FILE) run --rm backend-test

test-frontend-docker: check-docker
	@$(DOCKER_COMPOSE) -f $(TEST_COMPOSE_FILE) run --rm frontend-test sh -lc "npm ci && npm run lint && npm run test"

test-docker: test-backend-docker test-frontend-docker

test-ios: check-xcode
	@xcodebuild test -project "$(IOS_PROJECT)" -scheme "$(IOS_SCHEME)" -destination "$(IOS_DESTINATION)"

test-android: check-android-gradle
	@$(ANDROID_GRADLEW) -p "$(ANDROID_PROJECT)" :core:model:test :core:data:test :core:network:test :app:assembleDebug

test-all: test-docker test-android test-ios
