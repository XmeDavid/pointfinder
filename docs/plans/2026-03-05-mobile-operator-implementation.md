# Mobile Operator Feature Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring full web-admin operator features to Android and iOS with improved UX, following the Adaptive Context design (map-first for field work, structured hub for planning).

**Architecture:** Two platforms (Android Jetpack Compose, iOS SwiftUI) implementing the same design independently. Both share the same backend API (no backend changes needed). Features organized around: navigation restructuring, game setup hub, base/challenge/team CRUD, rich text editing, live monitoring, and settings.

**Tech Stack:**
- Android: Kotlin, Jetpack Compose, Hilt DI, MapLibre, Coil, Material3, RichTextEditor library (TBD)
- iOS: Swift, SwiftUI, MapLibre, async/await, Observable macro
- Backend: Spring Boot REST API (all endpoints already exist)
- Content format: HTML (produced by Tiptap on web, replicated on mobile)

**Design doc:** `docs/plans/2026-03-05-mobile-operator-design.md`

---

## Conventions

**Android paths** are relative to `android-app/`
**iOS paths** are relative to `ios-app/dbv-nfc-games/`

**Android patterns:**
- ViewModels: `@HiltViewModel`, `MutableStateFlow<State>`, `viewModelScope.launch`
- UI: `@Composable` functions, Material3 components
- Navigation: `NavController` with string routes in `Routes.kt`
- Network: Retrofit `CompanionApi` interface, suspend functions
- Repository: `@Singleton`, delegates to `CompanionApi`
- i18n: `stringResource(R.string.key)` across `values/`, `values-de/`, `values-pt/`

**iOS patterns:**
- State: `@Observable` classes, `@State`/`@Environment` in views
- UI: SwiftUI structs, `NavigationStack`, `.sheet()`, `Form`
- Network: `actor APIClient`, async/await, `URLSession`
- i18n: `Translations.string("key")` via `locale.t("key")`

---

## Phase 1: Android Foundation (Models + API + Repository)

### Task 1: Add Android DTOs and Request Models

**Files:**
- Modify: `core/model/src/main/kotlin/com/prayer/pointfinder/core/model/Models.kt`

Add these data classes after the existing models:

```kotlin
// Game creation/update
data class CreateGameRequest(
    val name: String,
    val description: String = "",
    val startDate: String? = null,
    val endDate: String? = null,
    val uniformAssignment: Boolean = false,
    val tileSource: String? = null
)

data class UpdateGameRequest(
    val name: String,
    val description: String = "",
    val startDate: String? = null,
    val endDate: String? = null,
    val uniformAssignment: Boolean = false,
    val broadcastEnabled: Boolean = false,
    val tileSource: String? = null
)

data class UpdateGameStatusRequest(
    val status: String,
    val resetProgress: Boolean = false
)

// Base creation/update
data class CreateBaseRequest(
    val name: String,
    val description: String = "",
    val lat: Double,
    val lng: Double,
    val fixedChallengeId: String? = null,
    val requirePresenceToSubmit: Boolean = false,
    val hidden: Boolean = false
)

data class UpdateBaseRequest(
    val name: String,
    val description: String = "",
    val lat: Double,
    val lng: Double,
    val fixedChallengeId: String? = null,
    val requirePresenceToSubmit: Boolean = false,
    val hidden: Boolean = false
)

// Challenge creation/update
data class CreateChallengeRequest(
    val title: String,
    val description: String = "",
    val content: String = "",
    val completionContent: String = "",
    val answerType: String = "text",
    val autoValidate: Boolean = false,
    val correctAnswer: List<String> = emptyList(),
    val points: Int = 0,
    val locationBound: Boolean = false,
    val fixedBaseId: String? = null,
    val unlocksBaseId: String? = null
)

data class UpdateChallengeRequest(
    val title: String,
    val description: String = "",
    val content: String = "",
    val completionContent: String = "",
    val answerType: String = "text",
    val autoValidate: Boolean = false,
    val correctAnswer: List<String> = emptyList(),
    val points: Int = 0,
    val locationBound: Boolean = false,
    val fixedBaseId: String? = null,
    val unlocksBaseId: String? = null
)

// Team creation/update
data class CreateTeamRequest(val name: String)

data class UpdateTeamRequest(
    val name: String,
    val color: String? = null
)

// Team variables
data class TeamVariable(
    val key: String,
    val teamValues: Map<String, String>
)

data class TeamVariablesRequest(val variables: List<TeamVariable>)

data class TeamVariablesResponse(val variables: List<TeamVariable>)

data class TeamVariablesCompletenessResponse(
    val complete: Boolean,
    val errors: List<String>
)

// Notifications
data class NotificationResponse(
    val id: String,
    val gameId: String,
    val message: String,
    val targetTeamId: String?,
    val sentAt: String,
    val sentBy: String
)

data class SendNotificationRequest(
    val message: String,
    val targetTeamId: String? = null
)

// Players
data class PlayerResponse(
    val id: String,
    val teamId: String,
    val deviceId: String,
    val displayName: String
)

// Operators/Invites
data class UserResponse(
    val id: String,
    val email: String,
    val name: String,
    val role: String
)

data class InviteRequest(
    val email: String,
    val gameId: String? = null
)

data class InviteResponse(
    val id: String,
    val gameId: String?,
    val gameName: String?,
    val email: String,
    val status: String,
    val invitedBy: String,
    val inviterName: String,
    val createdAt: String
)

// Monitoring
data class LeaderboardEntry(
    val teamId: String,
    val teamName: String,
    val teamColor: String,
    val points: Int,
    val completedChallenges: Int
)

data class ActivityEvent(
    val type: String,
    val teamId: String?,
    val teamName: String?,
    val teamColor: String?,
    val baseName: String?,
    val challengeTitle: String?,
    val message: String,
    val timestamp: String
)

// Export/Import
data class GameExportDto(
    val exportVersion: String,
    val exportedAt: String,
    val game: GameExportGame,
    val bases: List<GameExportBase>,
    val challenges: List<GameExportChallenge>,
    val assignments: List<GameExportAssignment>,
    val teams: List<GameExportTeam>
)

data class GameExportGame(
    val name: String,
    val description: String,
    val uniformAssignment: Boolean
)

data class GameExportBase(
    val tempId: String,
    val name: String,
    val description: String,
    val lat: Double,
    val lng: Double,
    val hidden: Boolean,
    val requirePresenceToSubmit: Boolean,
    val fixedChallengeTempId: String?
)

data class GameExportChallenge(
    val tempId: String,
    val title: String,
    val description: String,
    val content: String,
    val completionContent: String,
    val answerType: String,
    val autoValidate: Boolean,
    val correctAnswer: List<String>,
    val points: Int,
    val locationBound: Boolean,
    val unlocksBaseTempId: String?
)

data class GameExportAssignment(
    val baseTempId: String,
    val challengeTempId: String,
    val teamTempId: String?
)

data class GameExportTeam(
    val tempId: String,
    val name: String,
    val color: String
)

data class ImportGameRequest(
    val gameData: GameExportDto,
    val startDate: String? = null,
    val endDate: String? = null
)
```

Also update the existing `Game` data class to include all fields from the API:

```kotlin
data class Game(
    val id: String,
    val name: String,
    val description: String,
    val status: String,
    val tileSource: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val createdBy: String? = null,
    val operatorIds: List<String>? = null,
    val uniformAssignment: Boolean = false,
    val broadcastEnabled: Boolean = false,
    val broadcastCode: String? = null
)
```

**Step 1:** Add all DTOs to Models.kt
**Step 2:** Verify compilation: `cd android-app && ./gradlew :core:model:build`
**Step 3:** Commit: `feat(android): add DTOs for operator CRUD, monitoring, and export/import`

---

### Task 2: Add Android API Endpoints

**Files:**
- Modify: `core/network/src/main/kotlin/com/prayer/pointfinder/core/network/CompanionApi.kt`

Add all new Retrofit endpoints. Group them logically after the existing operator endpoints (~line 185):

```kotlin
// === Game CRUD ===
@POST("api/games")
suspend fun createGame(@Body request: CreateGameRequest): Game

@GET("api/games/{gameId}")
suspend fun getGame(@Path("gameId") gameId: String): Game

@PUT("api/games/{gameId}")
suspend fun updateGame(@Path("gameId") gameId: String, @Body request: UpdateGameRequest): Game

@DELETE("api/games/{gameId}")
suspend fun deleteGame(@Path("gameId") gameId: String)

@PATCH("api/games/{gameId}/status")
suspend fun updateGameStatus(@Path("gameId") gameId: String, @Body request: UpdateGameStatusRequest): Game

// === Base CRUD ===
@POST("api/games/{gameId}/bases")
suspend fun createBase(@Path("gameId") gameId: String, @Body request: CreateBaseRequest): Base

@PUT("api/games/{gameId}/bases/{baseId}")
suspend fun updateBase(@Path("gameId") gameId: String, @Path("baseId") baseId: String, @Body request: UpdateBaseRequest): Base

@DELETE("api/games/{gameId}/bases/{baseId}")
suspend fun deleteBase(@Path("gameId") gameId: String, @Path("baseId") baseId: String)

// === Challenge CRUD ===
@POST("api/games/{gameId}/challenges")
suspend fun createChallenge(@Path("gameId") gameId: String, @Body request: CreateChallengeRequest): Challenge

@PUT("api/games/{gameId}/challenges/{challengeId}")
suspend fun updateChallenge(@Path("gameId") gameId: String, @Path("challengeId") challengeId: String, @Body request: UpdateChallengeRequest): Challenge

@DELETE("api/games/{gameId}/challenges/{challengeId}")
suspend fun deleteChallenge(@Path("gameId") gameId: String, @Path("challengeId") challengeId: String)

// === Team CRUD ===
@POST("api/games/{gameId}/teams")
suspend fun createTeam(@Path("gameId") gameId: String, @Body request: CreateTeamRequest): Team

@PUT("api/games/{gameId}/teams/{teamId}")
suspend fun updateTeam(@Path("gameId") gameId: String, @Path("teamId") teamId: String, @Body request: UpdateTeamRequest): Team

@DELETE("api/games/{gameId}/teams/{teamId}")
suspend fun deleteTeam(@Path("gameId") gameId: String, @Path("teamId") teamId: String)

@GET("api/games/{gameId}/teams/{teamId}/players")
suspend fun getTeamPlayers(@Path("gameId") gameId: String, @Path("teamId") teamId: String): List<PlayerResponse>

@DELETE("api/games/{gameId}/teams/{teamId}/players/{playerId}")
suspend fun removePlayer(@Path("gameId") gameId: String, @Path("teamId") teamId: String, @Path("playerId") playerId: String)

// === Notifications ===
@GET("api/games/{gameId}/notifications")
suspend fun getNotifications(@Path("gameId") gameId: String): List<NotificationResponse>

@POST("api/games/{gameId}/notifications")
suspend fun sendNotification(@Path("gameId") gameId: String, @Body request: SendNotificationRequest): NotificationResponse

// === Game Operators ===
@GET("api/games/{gameId}/operators")
suspend fun getGameOperators(@Path("gameId") gameId: String): List<UserResponse>

@POST("api/games/{gameId}/operators/{userId}")
suspend fun addGameOperator(@Path("gameId") gameId: String, @Path("userId") userId: String)

@DELETE("api/games/{gameId}/operators/{userId}")
suspend fun removeGameOperator(@Path("gameId") gameId: String, @Path("userId") userId: String)

// === Invites ===
@GET("api/invites/game/{gameId}")
suspend fun getGameInvites(@Path("gameId") gameId: String): List<InviteResponse>

@POST("api/invites")
suspend fun createInvite(@Body request: InviteRequest): InviteResponse

// === Team Variables ===
@GET("api/games/{gameId}/team-variables")
suspend fun getGameVariables(@Path("gameId") gameId: String): TeamVariablesResponse

@PUT("api/games/{gameId}/team-variables")
suspend fun saveGameVariables(@Path("gameId") gameId: String, @Body request: TeamVariablesRequest): TeamVariablesResponse

@GET("api/games/{gameId}/challenges/{challengeId}/team-variables")
suspend fun getChallengeVariables(@Path("gameId") gameId: String, @Path("challengeId") challengeId: String): TeamVariablesResponse

@PUT("api/games/{gameId}/challenges/{challengeId}/team-variables")
suspend fun saveChallengeVariables(@Path("gameId") gameId: String, @Path("challengeId") challengeId: String, @Body request: TeamVariablesRequest): TeamVariablesResponse

@GET("api/games/{gameId}/team-variables/completeness")
suspend fun getVariablesCompleteness(@Path("gameId") gameId: String): TeamVariablesCompletenessResponse

// === Monitoring ===
@GET("api/games/{gameId}/monitoring/leaderboard")
suspend fun getLeaderboard(@Path("gameId") gameId: String): List<LeaderboardEntry>

@GET("api/games/{gameId}/monitoring/activity")
suspend fun getActivity(@Path("gameId") gameId: String): List<ActivityEvent>

// === Export/Import ===
@GET("api/games/{gameId}/export")
suspend fun exportGame(@Path("gameId") gameId: String): GameExportDto

@POST("api/games/import")
suspend fun importGame(@Body request: ImportGameRequest): Game
```

**Step 1:** Add all endpoints to CompanionApi.kt
**Step 2:** Verify compilation: `cd android-app && ./gradlew :core:network:build`
**Step 3:** Commit: `feat(android): add API endpoints for full operator CRUD`

---

### Task 3: Extend Android OperatorRepository

**Files:**
- Modify: `core/data/src/main/kotlin/com/prayer/pointfinder/core/data/repo/OperatorRepository.kt`

Add delegate methods for all new API endpoints. Follow existing pattern (suspend functions delegating to `api`):

```kotlin
// Game CRUD
suspend fun createGame(request: CreateGameRequest) = api.createGame(request)
suspend fun getGame(gameId: String) = api.getGame(gameId)
suspend fun updateGame(gameId: String, request: UpdateGameRequest) = api.updateGame(gameId, request)
suspend fun deleteGame(gameId: String) = api.deleteGame(gameId)
suspend fun updateGameStatus(gameId: String, request: UpdateGameStatusRequest) = api.updateGameStatus(gameId, request)

// Base CRUD
suspend fun createBase(gameId: String, request: CreateBaseRequest) = api.createBase(gameId, request)
suspend fun updateBase(gameId: String, baseId: String, request: UpdateBaseRequest) = api.updateBase(gameId, baseId, request)
suspend fun deleteBase(gameId: String, baseId: String) = api.deleteBase(gameId, baseId)

// Challenge CRUD
suspend fun createChallenge(gameId: String, request: CreateChallengeRequest) = api.createChallenge(gameId, request)
suspend fun updateChallenge(gameId: String, challengeId: String, request: UpdateChallengeRequest) = api.updateChallenge(gameId, challengeId, request)
suspend fun deleteChallenge(gameId: String, challengeId: String) = api.deleteChallenge(gameId, challengeId)

// Team CRUD
suspend fun createTeam(gameId: String, request: CreateTeamRequest) = api.createTeam(gameId, request)
suspend fun updateTeam(gameId: String, teamId: String, request: UpdateTeamRequest) = api.updateTeam(gameId, teamId, request)
suspend fun deleteTeam(gameId: String, teamId: String) = api.deleteTeam(gameId, teamId)
suspend fun getTeamPlayers(gameId: String, teamId: String) = api.getTeamPlayers(gameId, teamId)
suspend fun removePlayer(gameId: String, teamId: String, playerId: String) = api.removePlayer(gameId, teamId, playerId)

// Notifications
suspend fun getNotifications(gameId: String) = api.getNotifications(gameId)
suspend fun sendNotification(gameId: String, request: SendNotificationRequest) = api.sendNotification(gameId, request)

// Operators
suspend fun getGameOperators(gameId: String) = api.getGameOperators(gameId)
suspend fun addGameOperator(gameId: String, userId: String) = api.addGameOperator(gameId, userId)
suspend fun removeGameOperator(gameId: String, userId: String) = api.removeGameOperator(gameId, userId)
suspend fun getGameInvites(gameId: String) = api.getGameInvites(gameId)
suspend fun createInvite(request: InviteRequest) = api.createInvite(request)

// Team Variables
suspend fun getGameVariables(gameId: String) = api.getGameVariables(gameId)
suspend fun saveGameVariables(gameId: String, request: TeamVariablesRequest) = api.saveGameVariables(gameId, request)
suspend fun getChallengeVariables(gameId: String, challengeId: String) = api.getChallengeVariables(gameId, challengeId)
suspend fun saveChallengeVariables(gameId: String, challengeId: String, request: TeamVariablesRequest) = api.saveChallengeVariables(gameId, challengeId, request)
suspend fun getVariablesCompleteness(gameId: String) = api.getVariablesCompleteness(gameId)

// Monitoring
suspend fun getLeaderboard(gameId: String) = api.getLeaderboard(gameId)
suspend fun getActivity(gameId: String) = api.getActivity(gameId)

// Export/Import
suspend fun exportGame(gameId: String) = api.exportGame(gameId)
suspend fun importGame(request: ImportGameRequest) = api.importGame(request)
```

**Step 1:** Add all repository methods
**Step 2:** Run tests: `cd android-app && ./gradlew :core:data:test`
**Step 3:** Commit: `feat(android): extend OperatorRepository with full CRUD methods`

---

## Phase 2: iOS Foundation (Models + API)

### Task 4: Add iOS Models and Request Types

**Files:**
- Modify: `Models/Game.swift` -- add request structs and update Game
- Create: `Models/Operator.swift` -- new operator-specific models

Update `Game` struct in `Game.swift` to include all API fields:

```swift
struct Game: Codable, Identifiable {
    let id: UUID
    let name: String
    let description: String
    let status: String
    let tileSource: String?
    let startDate: String?
    let endDate: String?
    let createdBy: UUID?
    let operatorIds: [UUID]?
    let uniformAssignment: Bool?
    let broadcastEnabled: Bool?
    let broadcastCode: String?
}
```

Create `Models/Operator.swift`:

```swift
import Foundation

// MARK: - Game Requests
struct CreateGameRequest: Encodable {
    let name: String
    var description: String = ""
    var startDate: String?
    var endDate: String?
    var uniformAssignment: Bool = false
    var tileSource: String?
}

struct UpdateGameRequest: Encodable {
    let name: String
    var description: String = ""
    var startDate: String?
    var endDate: String?
    var uniformAssignment: Bool = false
    var broadcastEnabled: Bool = false
    var tileSource: String?
}

struct UpdateGameStatusRequest: Encodable {
    let status: String
    var resetProgress: Bool = false
}

// MARK: - Base Requests
struct CreateBaseRequest: Encodable {
    let name: String
    var description: String = ""
    let lat: Double
    let lng: Double
    var fixedChallengeId: UUID?
    var requirePresenceToSubmit: Bool = false
    var hidden: Bool = false
}

struct UpdateBaseRequest: Encodable {
    let name: String
    var description: String = ""
    let lat: Double
    let lng: Double
    var fixedChallengeId: UUID?
    var requirePresenceToSubmit: Bool = false
    var hidden: Bool = false
}

// MARK: - Challenge Requests
struct CreateChallengeRequest: Encodable {
    let title: String
    var description: String = ""
    var content: String = ""
    var completionContent: String = ""
    var answerType: String = "text"
    var autoValidate: Bool = false
    var correctAnswer: [String] = []
    var points: Int = 0
    var locationBound: Bool = false
    var fixedBaseId: UUID?
    var unlocksBaseId: UUID?
}

struct UpdateChallengeRequest: Encodable {
    let title: String
    var description: String = ""
    var content: String = ""
    var completionContent: String = ""
    var answerType: String = "text"
    var autoValidate: Bool = false
    var correctAnswer: [String] = []
    var points: Int = 0
    var locationBound: Bool = false
    var fixedBaseId: UUID?
    var unlocksBaseId: UUID?
}

// MARK: - Team Requests
struct CreateTeamRequest: Encodable {
    let name: String
}

struct UpdateTeamRequest: Encodable {
    let name: String
    var color: String?
}

// MARK: - Team Variables
struct TeamVariable: Codable {
    let key: String
    let teamValues: [String: String]
}

struct TeamVariablesRequest: Encodable {
    let variables: [TeamVariable]
}

struct TeamVariablesResponse: Codable {
    let variables: [TeamVariable]
}

struct TeamVariablesCompletenessResponse: Codable {
    let complete: Bool
    let errors: [String]
}

// MARK: - Notifications
struct NotificationResponse: Codable, Identifiable {
    let id: UUID
    let gameId: UUID
    let message: String
    let targetTeamId: UUID?
    let sentAt: String
    let sentBy: UUID
}

struct SendNotificationRequest: Encodable {
    let message: String
    var targetTeamId: UUID?
}

// MARK: - Players
struct PlayerResponse: Codable, Identifiable {
    let id: UUID
    let teamId: UUID
    let deviceId: String
    let displayName: String
}

// MARK: - Operators & Invites
struct UserResponse: Codable, Identifiable {
    let id: UUID
    let email: String
    let name: String
    let role: String
}

struct InviteRequest: Encodable {
    let email: String
    var gameId: UUID?
}

struct InviteResponse: Codable, Identifiable {
    let id: UUID
    let gameId: UUID?
    let gameName: String?
    let email: String
    let status: String
    let invitedBy: UUID
    let inviterName: String
    let createdAt: String
}

// MARK: - Monitoring
struct LeaderboardEntry: Codable, Identifiable {
    var id: UUID { teamId }
    let teamId: UUID
    let teamName: String
    let teamColor: String
    let points: Int
    let completedChallenges: Int
}

struct ActivityEvent: Codable, Identifiable {
    var id: String { "\(type)-\(timestamp)-\(teamId?.uuidString ?? "")" }
    let type: String
    let teamId: UUID?
    let teamName: String?
    let teamColor: String?
    let baseName: String?
    let challengeTitle: String?
    let message: String
    let timestamp: String
}

// MARK: - Export/Import
struct GameExportDto: Codable {
    let exportVersion: String
    let exportedAt: String
    let game: GameExportGame
    let bases: [GameExportBase]
    let challenges: [GameExportChallenge]
    let assignments: [GameExportAssignment]
    let teams: [GameExportTeam]
}

struct GameExportGame: Codable {
    let name: String
    let description: String
    let uniformAssignment: Bool
}

struct GameExportBase: Codable {
    let tempId: String
    let name: String
    let description: String
    let lat: Double
    let lng: Double
    let hidden: Bool
    let requirePresenceToSubmit: Bool
    let fixedChallengeTempId: String?
}

struct GameExportChallenge: Codable {
    let tempId: String
    let title: String
    let description: String
    let content: String
    let completionContent: String
    let answerType: String
    let autoValidate: Bool
    let correctAnswer: [String]
    let points: Int
    let locationBound: Bool
    let unlocksBaseTempId: String?
}

struct GameExportAssignment: Codable {
    let baseTempId: String
    let challengeTempId: String
    let teamTempId: String?
}

struct GameExportTeam: Codable {
    let tempId: String
    let name: String
    let color: String
}

struct ImportGameRequest: Encodable {
    let gameData: GameExportDto
    var startDate: String?
    var endDate: String?
}
```

**Step 1:** Update Game.swift and create Operator.swift
**Step 2:** Build to verify: Xcode build or `xcodebuild -scheme dbv-nfc-games build`
**Step 3:** Commit: `feat(ios): add models for operator CRUD, monitoring, and export/import`

---

### Task 5: Add iOS APIClient Methods

**Files:**
- Modify: `Services/APIClient.swift`

Add all new methods after the existing operator endpoints (~line 260). Follow the existing pattern (async throws, token parameter):

```swift
// MARK: - Game CRUD
func createGame(_ request: CreateGameRequest, token: String) async throws -> Game {
    try await post("api/games", body: request, token: token)
}

func getGame(_ gameId: UUID, token: String) async throws -> Game {
    try await get("api/games/\(gameId)", token: token)
}

func updateGame(_ gameId: UUID, _ request: UpdateGameRequest, token: String) async throws -> Game {
    try await put("api/games/\(gameId)", body: request, token: token)
}

func deleteGame(_ gameId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)", token: token)
}

func updateGameStatus(_ gameId: UUID, _ request: UpdateGameStatusRequest, token: String) async throws -> Game {
    try await patch("api/games/\(gameId)/status", body: request, token: token)
}

// MARK: - Base CRUD
func createBase(gameId: UUID, _ request: CreateBaseRequest, token: String) async throws -> Base {
    try await post("api/games/\(gameId)/bases", body: request, token: token)
}

func updateBase(gameId: UUID, baseId: UUID, _ request: UpdateBaseRequest, token: String) async throws -> Base {
    try await put("api/games/\(gameId)/bases/\(baseId)", body: request, token: token)
}

func deleteBase(gameId: UUID, baseId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)/bases/\(baseId)", token: token)
}

// MARK: - Challenge CRUD
func createChallenge(gameId: UUID, _ request: CreateChallengeRequest, token: String) async throws -> Challenge {
    try await post("api/games/\(gameId)/challenges", body: request, token: token)
}

func updateChallenge(gameId: UUID, challengeId: UUID, _ request: UpdateChallengeRequest, token: String) async throws -> Challenge {
    try await put("api/games/\(gameId)/challenges/\(challengeId)", body: request, token: token)
}

func deleteChallenge(gameId: UUID, challengeId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)/challenges/\(challengeId)", token: token)
}

// MARK: - Team CRUD
func createTeam(gameId: UUID, _ request: CreateTeamRequest, token: String) async throws -> Team {
    try await post("api/games/\(gameId)/teams", body: request, token: token)
}

func updateTeam(gameId: UUID, teamId: UUID, _ request: UpdateTeamRequest, token: String) async throws -> Team {
    try await put("api/games/\(gameId)/teams/\(teamId)", body: request, token: token)
}

func deleteTeam(gameId: UUID, teamId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)/teams/\(teamId)", token: token)
}

func getTeamPlayers(gameId: UUID, teamId: UUID, token: String) async throws -> [PlayerResponse] {
    try await get("api/games/\(gameId)/teams/\(teamId)/players", token: token)
}

func removePlayer(gameId: UUID, teamId: UUID, playerId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)/teams/\(teamId)/players/\(playerId)", token: token)
}

// MARK: - Notifications
func getNotifications(gameId: UUID, token: String) async throws -> [NotificationResponse] {
    try await get("api/games/\(gameId)/notifications", token: token)
}

func sendNotification(gameId: UUID, _ request: SendNotificationRequest, token: String) async throws -> NotificationResponse {
    try await post("api/games/\(gameId)/notifications", body: request, token: token)
}

// MARK: - Operators
func getGameOperators(gameId: UUID, token: String) async throws -> [UserResponse] {
    try await get("api/games/\(gameId)/operators", token: token)
}

func addGameOperator(gameId: UUID, userId: UUID, token: String) async throws {
    try await postVoid("api/games/\(gameId)/operators/\(userId)", token: token)
}

func removeGameOperator(gameId: UUID, userId: UUID, token: String) async throws {
    try await deleteVoid("api/games/\(gameId)/operators/\(userId)", token: token)
}

func getGameInvites(gameId: UUID, token: String) async throws -> [InviteResponse] {
    try await get("api/invites/game/\(gameId)", token: token)
}

func createInvite(_ request: InviteRequest, token: String) async throws -> InviteResponse {
    try await post("api/invites", body: request, token: token)
}

// MARK: - Team Variables
func getGameVariables(gameId: UUID, token: String) async throws -> TeamVariablesResponse {
    try await get("api/games/\(gameId)/team-variables", token: token)
}

func saveGameVariables(gameId: UUID, _ request: TeamVariablesRequest, token: String) async throws -> TeamVariablesResponse {
    try await put("api/games/\(gameId)/team-variables", body: request, token: token)
}

func getChallengeVariables(gameId: UUID, challengeId: UUID, token: String) async throws -> TeamVariablesResponse {
    try await get("api/games/\(gameId)/challenges/\(challengeId)/team-variables", token: token)
}

func saveChallengeVariables(gameId: UUID, challengeId: UUID, _ request: TeamVariablesRequest, token: String) async throws -> TeamVariablesResponse {
    try await put("api/games/\(gameId)/challenges/\(challengeId)/team-variables", body: request, token: token)
}

func getVariablesCompleteness(gameId: UUID, token: String) async throws -> TeamVariablesCompletenessResponse {
    try await get("api/games/\(gameId)/team-variables/completeness", token: token)
}

// MARK: - Monitoring
func getLeaderboard(gameId: UUID, token: String) async throws -> [LeaderboardEntry] {
    try await get("api/games/\(gameId)/monitoring/leaderboard", token: token)
}

func getActivity(gameId: UUID, token: String) async throws -> [ActivityEvent] {
    try await get("api/games/\(gameId)/monitoring/activity", token: token)
}

// MARK: - Export/Import
func exportGame(gameId: UUID, token: String) async throws -> GameExportDto {
    try await get("api/games/\(gameId)/export", token: token)
}

func importGame(_ request: ImportGameRequest, token: String) async throws -> Game {
    try await post("api/games/import", body: request, token: token)
}
```

**Note:** Check if `postVoid` and `patch` with body methods exist. If not, add them following the existing `deleteVoid` pattern. The existing `patch` only supports query params -- add a body variant:

```swift
func patch<T: Decodable, B: Encodable>(_ path: String, body: B, token: String) async throws -> T {
    var request = try makeRequest(path, method: "PATCH", token: token)
    request.httpBody = try JSONEncoder().encode(body)
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return try await execute(request)
}

func postVoid(_ path: String, token: String) async throws {
    let request = try makeRequest(path, method: "POST", token: token)
    let (_, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse,
          (200...299).contains(httpResponse.statusCode) else {
        throw APIError.requestFailed
    }
}
```

**Step 1:** Add all new APIClient methods
**Step 2:** Add missing HTTP method variants if needed
**Step 3:** Build to verify
**Step 4:** Commit: `feat(ios): add APIClient methods for full operator CRUD`

---

## Phase 3: Android Navigation Restructuring

### Task 6: Restructure Android Bottom Navigation

**Files:**
- Modify: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorScreens.kt` (OperatorGameScaffold, OperatorTab enum)
- Modify: `app/src/main/java/com/prayer/pointfinder/navigation/Routes.kt`
- Modify: `app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt`
- Modify: `core/i18n/src/main/res/values/strings.xml` (+ de, pt)

**Changes to OperatorTab enum** (in OperatorScreens.kt):
```kotlin
enum class OperatorTab {
    LIVE_MAP,
    SETUP,       // New: replaces BASES in setup mode
    LIVE,        // New: leaderboard + activity in live mode
    SUBMISSIONS,
    MORE         // New: replaces SETTINGS
}
```

**Changes to OperatorGameScaffold:**
- Bottom nav items depend on `game.status`:
  - Setup: Map, Setup, Submissions, More
  - Live/Ended: Map, Live, Submissions, More
- Setup tab shows setup hub (new screen)
- Live tab shows leaderboard + activity (new screen)
- More tab shows settings/notifications/operators/export

**Add new routes** (in Routes.kt):
```kotlin
const val OPERATOR_SETUP_HUB = "operator/setup"
const val OPERATOR_BASES_LIST = "operator/bases"
const val OPERATOR_BASE_EDIT = "operator/bases/{baseId}"
const val OPERATOR_BASE_CREATE = "operator/bases/new"
const val OPERATOR_CHALLENGES_LIST = "operator/challenges"
const val OPERATOR_CHALLENGE_EDIT = "operator/challenges/{challengeId}"
const val OPERATOR_CHALLENGE_CREATE = "operator/challenges/new"
const val OPERATOR_RICH_TEXT_EDITOR = "operator/editor"
const val OPERATOR_TEAMS_LIST = "operator/teams"
const val OPERATOR_TEAM_DETAIL = "operator/teams/{teamId}"
const val OPERATOR_TEAM_CREATE = "operator/teams/new"
const val OPERATOR_LIVE = "operator/live"
const val OPERATOR_MORE = "operator/more"
const val OPERATOR_GAME_SETTINGS = "operator/settings"
const val OPERATOR_NOTIFICATIONS = "operator/notifications"
const val OPERATOR_OPERATORS = "operator/operators"
const val OPERATOR_CREATE_GAME = "operator/create-game"
```

**Add i18n strings** for all new labels (en, pt, de):
```xml
<string name="label_setup">Setup</string>
<string name="label_live">Live</string>
<string name="label_more">More</string>
<string name="label_create_game">Create Game</string>
<!-- ... more strings for each new screen -->
```

**Step 1:** Update OperatorTab enum and OperatorGameScaffold to use status-aware tabs
**Step 2:** Add new routes to Routes.kt
**Step 3:** Add placeholder composables for new tabs (just Text("TODO") screens)
**Step 4:** Wire up routes in AppNavigation.kt
**Step 5:** Add i18n strings for all 3 languages
**Step 6:** Build and verify navigation works: `./gradlew :app:assembleDebug`
**Step 7:** Commit: `feat(android): restructure operator navigation with setup/live/more tabs`

---

## Phase 4: iOS Navigation Restructuring

### Task 7: Restructure iOS TabView

**Files:**
- Modify: `Features/Operator/OperatorGameView.swift` (TabView restructuring)
- Modify: `App/Translations.swift` (new keys)

**Changes to OperatorGameView:**
Replace the current 4-tab layout with status-aware tabs:

```swift
struct OperatorGameView: View {
    let game: Game
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Map (always)
            OperatorMapView(game: game)
                .tabItem { Label(locale.t("operator.liveMap"), systemImage: "map") }
                .tag(0)

            // Tab 2: Setup (in setup) or Live (in live/ended)
            if game.status == "setup" {
                OperatorSetupHubView(game: game)
                    .tabItem { Label(locale.t("operator.setup"), systemImage: "checklist") }
                    .tag(1)
            } else {
                OperatorLiveView(game: game)
                    .tabItem { Label(locale.t("operator.live"), systemImage: "chart.bar") }
                    .tag(1)
            }

            // Tab 3: Submissions
            OperatorSubmissionsView(game: game)
                .tabItem { Label(locale.t("operator.submissions"), systemImage: "doc.text") }
                .tag(2)

            // Tab 4: More
            OperatorMoreView(game: game)
                .tabItem { Label(locale.t("operator.more"), systemImage: "ellipsis") }
                .tag(3)
        }
    }
}
```

Create stub views for new tabs:
- `Features/Operator/OperatorSetupHubView.swift`
- `Features/Operator/OperatorLiveView.swift`
- `Features/Operator/OperatorMoreView.swift`

Add translation keys in `Translations.swift` for en, pt, de:
```swift
"operator.setup": "Setup",
"operator.live": "Live",
"operator.more": "More",
"operator.createGame": "Create Game",
// ... more keys
```

**Step 1:** Create stub view files
**Step 2:** Refactor OperatorGameView TabView
**Step 3:** Add all new translation keys (en, pt, de)
**Step 4:** Build to verify
**Step 5:** Commit: `feat(ios): restructure operator navigation with setup/live/more tabs`

---

## Phase 5: Game Creation

### Task 8: Android Create Game Screen

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/CreateGameScreen.kt`
- Modify: `app/src/main/java/com/prayer/pointfinder/session/OperatorViewModel.kt` (add create/import methods)
- Modify: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorScreens.kt` (add button to game list)

**Screen layout:**
- TopAppBar with back arrow and "Create Game" title
- Name OutlinedTextField (required)
- Description OutlinedTextField (multiline)
- "Start From" section with RadioButton group: Empty / Import from file
- When Import selected: button to pick JSON file using `ActivityResultContracts.GetContent`
- Create button (disabled when name is empty or importing but no file selected)
- Loading state while creating

**ViewModel additions:**
```kotlin
fun createGame(name: String, description: String, onSuccess: (Game) -> Unit) {
    viewModelScope.launch {
        runCatching {
            repo.createGame(CreateGameRequest(name = name, description = description))
        }.onSuccess { game ->
            loadGames()
            onSuccess(game)
        }.onFailure { /* set error */ }
    }
}

fun importGame(name: String, exportData: GameExportDto, onSuccess: (Game) -> Unit) {
    viewModelScope.launch {
        runCatching {
            val request = ImportGameRequest(
                gameData = exportData.copy(game = exportData.game.copy(name = name))
            )
            repo.importGame(request)
        }.onSuccess { game ->
            loadGames()
            onSuccess(game)
        }.onFailure { /* set error */ }
    }
}
```

**Step 1:** Add createGame/importGame to OperatorViewModel
**Step 2:** Create CreateGameScreen composable
**Step 3:** Wire up in AppNavigation with route
**Step 4:** Add "Create Game" button to OperatorHomeScreen game list
**Step 5:** Add i18n strings
**Step 6:** Build and test: `./gradlew :app:assembleDebug`
**Step 7:** Commit: `feat(android): add create game screen with import support`

---

### Task 9: iOS Create Game Screen

**Files:**
- Create: `Features/Operator/CreateGameView.swift`
- Modify: `Features/Operator/OperatorHomeView.swift` (add create button and sheet)

**Pattern:** Present as `.sheet` from OperatorHomeView. Use `@State` for form fields. On success, set `selectedGame` to the new game.

```swift
struct CreateGameView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var importMode = false
    @State private var importData: GameExportDto?
    @State private var isCreating = false
    @State private var showFilePicker = false

    var onCreated: (Game) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(locale.t("operator.gameName"), text: $name)
                    TextField(locale.t("operator.gameDescription"), text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section(locale.t("operator.startFrom")) {
                    Picker("", selection: $importMode) {
                        Text(locale.t("operator.emptyGame")).tag(false)
                        Text(locale.t("operator.importFromFile")).tag(true)
                    }
                    .pickerStyle(.segmented)
                    if importMode {
                        Button(locale.t("operator.selectFile")) { showFilePicker = true }
                        if importData != nil {
                            Label(locale.t("operator.fileLoaded"), systemImage: "checkmark.circle.fill")
                        }
                    }
                }
            }
            .navigationTitle(locale.t("operator.createGame"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.create")) { createGame() }
                        .disabled(name.isEmpty || isCreating || (importMode && importData == nil))
                }
            }
            .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.json]) { result in
                // Parse JSON file into GameExportDto
            }
        }
    }

    private func createGame() { /* call API, dismiss, invoke onCreated */ }
}
```

**Step 1:** Create CreateGameView.swift
**Step 2:** Add sheet presentation to OperatorHomeView
**Step 3:** Add translation keys
**Step 4:** Build to verify
**Step 5:** Commit: `feat(ios): add create game screen with import support`

---

## Phase 6: Setup Hub

### Task 10: Android Setup Hub Screen

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/SetupHubScreen.kt`
- Modify: `app/src/main/java/com/prayer/pointfinder/session/OperatorViewModel.kt` (add readiness check logic)

**Readiness checks** (computed from existing state in OperatorState):
```kotlin
data class ReadinessWarning(
    val message: String,
    val count: Int? = null,
    val navigateTo: String // route
)

fun getReadinessWarnings(state: OperatorState): List<ReadinessWarning> {
    val warnings = mutableListOf<ReadinessWarning>()
    val unlinkedNfc = state.bases.count { !it.nfcLinked }
    if (unlinkedNfc > 0) warnings.add(ReadinessWarning("NFC missing ($unlinkedNfc bases)", unlinkedNfc, Routes.OPERATOR_BASES_LIST))
    if (state.bases.isEmpty()) warnings.add(ReadinessWarning("No bases created", navigateTo = Routes.OPERATOR_BASES_LIST))
    if (state.challenges.isEmpty()) warnings.add(ReadinessWarning("No challenges created", navigateTo = Routes.OPERATOR_CHALLENGES_LIST))
    if (state.teams.isEmpty()) warnings.add(ReadinessWarning("No teams created", navigateTo = Routes.OPERATOR_TEAMS_LIST))
    // Location-bound challenges without fixed base assignment
    // Team variables completeness (requires API call)
    return warnings
}
```

**Screen composable:** LazyColumn with:
1. Game name + status header
2. "Needs Attention" section (only if warnings exist) -- each warning is a clickable Row with icon + text + chevron
3. "Manage" section -- 3 rows: Bases (count), Challenges (count), Teams (count) -- each navigable
4. "Go Live" button at bottom (enabled when no warnings)

**Step 1:** Add readiness check logic to ViewModel
**Step 2:** Create SetupHubScreen composable
**Step 3:** Wire up navigation from Setup tab
**Step 4:** Add i18n strings
**Step 5:** Build and verify
**Step 6:** Commit: `feat(android): add setup hub screen with readiness checklist`

---

### Task 11: iOS Setup Hub Screen

**Files:**
- Modify: `Features/Operator/OperatorSetupHubView.swift` (replace stub)

**Pattern:** Use `List` with sections. Compute warnings from loaded game data.

**Step 1:** Implement OperatorSetupHubView with warnings + manage links
**Step 2:** Add "Go Live" button with confirmation alert
**Step 3:** Add NavigationLinks to bases/challenges/teams list views
**Step 4:** Add translation keys
**Step 5:** Build and verify
**Step 6:** Commit: `feat(ios): add setup hub screen with readiness checklist`

---

## Phase 7: Base Management

### Task 12: Android Bases List + Edit Screen

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/BasesListScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/BaseEditScreen.kt`
- Modify: `app/src/main/java/com/prayer/pointfinder/session/OperatorViewModel.kt` (add base CRUD methods)

**ViewModel additions:**
```kotlin
fun createBase(gameId: String, request: CreateBaseRequest, onSuccess: (Base) -> Unit)
fun updateBase(gameId: String, baseId: String, request: UpdateBaseRequest, onSuccess: (Base) -> Unit)
fun deleteBase(gameId: String, baseId: String, onSuccess: () -> Unit)
```

**BasesListScreen:** LazyColumn of base cards. Each card shows name, challenge count (from assignments), NFC status badge. FAB "+" for create. Tap navigates to BaseEditScreen.

**BaseEditScreen:**
- Top: Embedded MapView (200dp height) with single draggable marker. Use MapLibre `addOnMapClickListener` and marker manipulation. The operator taps/drags the pin to set location. No lat/lng text fields.
- Middle: Name + Description text fields
- Toggles: requirePresence, hidden
- Dropdown: fixedChallenge (list of game's challenges)
- Bottom: "Challenges at this base" section -- list of challenges linked via assignments. "Add Challenge" button navigates to ChallengeEditScreen with baseId pre-set.
- Three-dot menu: Write NFC (reuse existing flow), Delete (confirmation dialog)

**Map pin dragging pattern** (Android MapLibre):
```kotlin
// Add a draggable marker source
val markerSource = GeoJsonSource("base-marker", Point.fromLngLat(lng, lat))
style.addSource(markerSource)
// Use a symbol layer with iconAllowOverlap
// On map click: update marker position + state
mapView.addOnMapClickListener { point ->
    markerSource.setGeoJson(Point.fromLngLat(point.longitude, point.latitude))
    onLocationChanged(point.latitude, point.longitude)
    true
}
```

**Step 1:** Add base CRUD methods to OperatorViewModel
**Step 2:** Create BasesListScreen
**Step 3:** Create BaseEditScreen with embedded map
**Step 4:** Wire up routes and navigation
**Step 5:** Add i18n strings
**Step 6:** Build and test
**Step 7:** Commit: `feat(android): add base management with map-based positioning`

---

### Task 13: iOS Bases List + Edit Screen

**Files:**
- Create: `Features/Operator/BasesManagementView.swift`
- Create: `Features/Operator/BaseEditView.swift`

**Pattern:** NavigationStack with List for bases. BaseEditView presented via NavigationLink. Embedded MapLibreMapView (250pt height) for pin positioning.

**Map pin in iOS:**
Extend `MapLibreMapView` to support a single editable pin mode:
- Add `editablePin: Binding<CLLocationCoordinate2D>?` parameter
- On map tap, update the binding
- Render pin annotation at binding coordinate

**Step 1:** Create BasesManagementView (list + create)
**Step 2:** Create BaseEditView with embedded map pin
**Step 3:** Extend MapLibreMapView for editable pin support
**Step 4:** Wire up navigation from Setup Hub
**Step 5:** Add translation keys
**Step 6:** Build and test
**Step 7:** Commit: `feat(ios): add base management with map-based positioning`

---

## Phase 8: Rich Text Editor

This is the most complex single feature. Each platform needs a native implementation.

### Task 14: Android Rich Text Editor

**Files:**
- Add dependency: `feature/operator/build.gradle.kts` -- add a rich text editor library
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt`

**Library choice:** Use `com.mohamedrejeb.richeditor:richeditor-compose` (Compose-native rich text editor that produces/consumes HTML). Add to build.gradle.kts:
```kotlin
implementation("com.mohamedrejeb.richeditor:richeditor-compose:1.0.0-rc08")
```

Check latest version at build time. This library provides:
- `RichTextEditor` composable
- `RichTextState` with HTML import/export: `state.setHtml(html)`, `state.toHtml()`
- Styling commands: `state.toggleBold()`, `state.toggleItalic()`, etc.

**RichTextEditorScreen composable:**
```kotlin
@Composable
fun RichTextEditorScreen(
    title: String,
    initialHtml: String,
    onDone: (String) -> Unit,
    onBack: () -> Unit,
    // For variable insertion:
    gameId: String,
    challengeId: String?,
    teams: List<Team>,
    viewModel: OperatorViewModel
) {
    val richTextState = rememberRichTextState()
    LaunchedEffect(initialHtml) { richTextState.setHtml(initialHtml) }

    var showVariableMenu by remember { mutableStateOf(false) }
    var showPreview by remember { mutableStateOf(false) }
    var previewTeamId by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = {
                    IconButton(onClick = { showVariableMenu = true }) {
                        Icon(Icons.Default.MoreVert, "Menu")
                    }
                    TextButton(onClick = { onDone(richTextState.toHtml()) }) { Text("Done") }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding)) {
            // Formatting toolbar
            RichTextToolbar(state = richTextState)
            // Editor
            RichTextEditor(
                state = richTextState,
                modifier = Modifier.fillMaxSize().padding(16.dp)
            )
        }
    }

    // Variable insertion dropdown menu
    DropdownMenu(expanded = showVariableMenu, onDismissRequest = { showVariableMenu = false }) {
        DropdownMenuItem(text = { Text("Insert Variable") }, onClick = { /* show variable picker dialog */ })
        DropdownMenuItem(text = { Text("Create Variable") }, onClick = { /* show create variable dialog */ })
        DropdownMenuItem(text = { Text("Preview as Team") }, onClick = { /* show team picker, then preview */ })
    }
}

@Composable
private fun RichTextToolbar(state: RichTextState) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        ToolbarButton(Icons.Default.FormatBold, "Bold", state.currentSpanStyle.fontWeight == FontWeight.Bold) { state.toggleBold() }
        ToolbarButton(Icons.Default.FormatItalic, "Italic", state.currentSpanStyle.fontStyle == FontStyle.Italic) { state.toggleItalic() }
        ToolbarButton(Icons.Default.FormatUnderlined, "Underline", state.currentSpanStyle.textDecoration?.contains(TextDecoration.Underline) == true) { state.toggleUnderline() }
        // H1, H2, bullet list, horizontal rule, image, link...
    }
}
```

**Variable insertion:**
- Fetch variables via `getGameVariables()` and/or `getChallengeVariables()`
- Show dialog with list of variable names
- On select: insert `{{variable_name}}` at cursor via `richTextState.addText("{{$variableName}}")`
- "Create Variable" shows a text input dialog, creates the variable key, then inserts it

**Preview as Team:**
- Show team picker dialog
- Fetch team's variable values
- Replace `{{key}}` with team values in the HTML
- Show rendered preview in a WebView or read-only RichTextEditor

**Step 1:** Add richeditor-compose dependency to build.gradle.kts
**Step 2:** Create RichTextEditorScreen with toolbar
**Step 3:** Add variable insertion flow (fetch + dialog + insert)
**Step 4:** Add "Preview as Team" flow
**Step 5:** Wire up route -- receives initialHtml, returns updatedHtml via savedStateHandle or callback
**Step 6:** Add i18n strings
**Step 7:** Build and test with sample HTML content
**Step 8:** Commit: `feat(android): add full-screen rich text editor with variable insertion`

---

### Task 15: iOS Rich Text Editor

**Files:**
- Create: `Features/Operator/RichTextEditorView.swift`

**Approach:** Use a `WKWebView`-based editor wrapping a lightweight HTML editor (like Quill.js or Tiptap loaded in a local HTML file), or use a native SwiftUI approach.

**Recommended: WKWebView + Tiptap** -- since the backend content is Tiptap HTML, using Tiptap in a WebView ensures format compatibility. Bundle a minimal HTML file:

Create `Resources/editor.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/@tiptap/core@latest"></script>
    <!-- Include tiptap extensions: bold, italic, underline, heading, bulletList, horizontalRule, image, link -->
    <style>
        body { font-family: -apple-system, system-ui; padding: 16px; }
        .ProseMirror { min-height: 200px; outline: none; }
        .ProseMirror:focus { outline: none; }
    </style>
</head>
<body>
    <div id="editor"></div>
    <script>
        // Initialize Tiptap editor
        // Expose getHTML(), setHTML(), exec() to Swift via message handlers
        window.webkit.messageHandlers.editorReady.postMessage({});
    </script>
</body>
</html>
```

**Alternative (simpler):** Use `UITextView` with `NSAttributedString` and HTML conversion. This is simpler but less feature-rich. Given that Tiptap HTML is the canonical format, the WebView approach ensures better compatibility.

**RichTextEditorView:**
```swift
struct RichTextEditorView: View {
    let title: String
    let initialHtml: String
    let onDone: (String) -> Void

    // Variable insertion context
    let gameId: UUID
    let challengeId: UUID?
    let teams: [Team]

    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var editorCoordinator = EditorCoordinator()
    @State private var showMenu = false
    @State private var showVariablePicker = false
    @State private var showPreview = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Toolbar row
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FormatButton(icon: "bold", action: { editorCoordinator.exec("toggleBold") })
                        FormatButton(icon: "italic", action: { editorCoordinator.exec("toggleItalic") })
                        FormatButton(icon: "underline", action: { editorCoordinator.exec("toggleUnderline") })
                        // H1, H2, list, hr, image, link...
                    }
                    .padding(.horizontal)
                }
                .frame(height: 44)

                // WebView editor
                EditorWebView(coordinator: editorCoordinator, initialHtml: initialHtml)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button(locale.t("operator.insertVariable")) { showVariablePicker = true }
                        Button(locale.t("operator.createVariable")) { /* show create dialog */ }
                        Button(locale.t("operator.previewAsTeam")) { showPreview = true }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) {
                        editorCoordinator.getHTML { html in
                            onDone(html)
                            dismiss()
                        }
                    }
                }
            }
        }
    }
}
```

**Step 1:** Create the bundled editor.html with Tiptap (or evaluate using a Swift-native library)
**Step 2:** Create EditorWebView UIViewRepresentable wrapping WKWebView
**Step 3:** Create RichTextEditorView with toolbar + menu
**Step 4:** Add variable insertion flow
**Step 5:** Add preview flow
**Step 6:** Add translation keys
**Step 7:** Build and test
**Step 8:** Commit: `feat(ios): add full-screen rich text editor with variable insertion`

---

## Phase 9: Challenge Management

### Task 16: Android Challenge List + Edit Screen

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengesListScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengeEditScreen.kt`

**ViewModel additions:**
```kotlin
fun createChallenge(gameId: String, request: CreateChallengeRequest, onSuccess: (Challenge) -> Unit)
fun updateChallenge(gameId: String, challengeId: String, request: UpdateChallengeRequest, onSuccess: (Challenge) -> Unit)
fun deleteChallenge(gameId: String, challengeId: String, onSuccess: () -> Unit)
```

**ChallengesListScreen:** LazyColumn of challenge cards. Each shows: title, points, linked base name (from fixedBaseId), answer type badge ("Text"/"Photo"). FAB for create.

**ChallengeEditScreen:** Scrollable Column with:
- Title + Points fields
- Content section: Description preview card (rendered HTML snippet) with "Edit" button -> navigates to RichTextEditorScreen. Same for Completion Message.
- Answer section: Type dropdown (text/file), Auto-validate toggle (shows correct answers chips when on), Correct answers as chip group with "+" to add.
- Linking section: Fixed to base dropdown, Location-bound toggle, Unlocks base dropdown.
- Three-dot menu: Delete

**Key pattern -- passing HTML to/from RichTextEditor:**
Use navigation arguments or shared ViewModel state. When "Edit" is tapped, navigate to editor with current HTML. When editor returns (via savedStateHandle or navigation result), update the local state.

**Step 1:** Add challenge CRUD methods to OperatorViewModel
**Step 2:** Create ChallengesListScreen
**Step 3:** Create ChallengeEditScreen with content previews
**Step 4:** Connect "Edit" buttons to RichTextEditorScreen
**Step 5:** Wire up routes and navigation
**Step 6:** Add i18n strings
**Step 7:** Build and test
**Step 8:** Commit: `feat(android): add challenge management with rich text content editing`

---

### Task 17: iOS Challenge List + Edit Screen

**Files:**
- Create: `Features/Operator/ChallengesManagementView.swift`
- Create: `Features/Operator/ChallengeEditView.swift`

**Same design as Android** adapted to SwiftUI patterns. Use `.sheet` for rich text editor presentation.

**Step 1:** Create ChallengesManagementView (list)
**Step 2:** Create ChallengeEditView (form with content previews)
**Step 3:** Connect "Edit" buttons to RichTextEditorView via `.sheet`
**Step 4:** Add translation keys
**Step 5:** Build and test
**Step 6:** Commit: `feat(ios): add challenge management with rich text content editing`

---

## Phase 10: Teams Management

### Task 18: Android Teams List + Detail Screen

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/TeamsListScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/TeamDetailScreen.kt`

**ViewModel additions:**
```kotlin
fun createTeam(gameId: String, request: CreateTeamRequest, onSuccess: (Team) -> Unit)
fun updateTeam(gameId: String, teamId: String, request: UpdateTeamRequest, onSuccess: (Team) -> Unit)
fun deleteTeam(gameId: String, teamId: String, onSuccess: () -> Unit)
fun loadTeamPlayers(gameId: String, teamId: String): Flow<List<PlayerResponse>>
fun removePlayer(gameId: String, teamId: String, playerId: String, onSuccess: () -> Unit)
fun loadTeamVariables(gameId: String, teamId: String) // loads game + challenge variables for this team
fun saveTeamVariableValue(gameId: String, variableKey: String, teamId: String, value: String)
```

**TeamsListScreen:** Cards with color dot, name, join code (with copy icon), player count. Create dialog: name + color picker (row of 12 color circles).

**TeamDetailScreen:**
- Name field + Color picker (12 swatches)
- Join Code section: code text + copy button + "Show QR" button (generates QR using `com.google.zxing` or similar)
- Variables section: list of variable keys with this team's values as text fields. Shows game-level and challenge-level variables merged.
- Players section: list with remove buttons
- Three-dot menu: Delete team

**QR Code generation** (Android): Use `zxing-android-embedded` or generate a Bitmap from `com.google.zxing.qrcode.QRCodeWriter` and display with `Image(bitmap = ...)`.

**Step 1:** Add team CRUD + variable methods to OperatorViewModel
**Step 2:** Create TeamsListScreen with create dialog
**Step 3:** Create TeamDetailScreen with variables and QR
**Step 4:** Wire up routes
**Step 5:** Add i18n strings
**Step 6:** Build and test
**Step 7:** Commit: `feat(android): add team management with variables and QR codes`

---

### Task 19: iOS Teams List + Detail Screen

**Files:**
- Create: `Features/Operator/TeamsManagementView.swift`
- Create: `Features/Operator/TeamDetailView.swift`

**QR Code generation** (iOS): Use `CoreImage` `CIFilter` with `CIQRCodeGenerator`:
```swift
func generateQRCode(from string: String) -> UIImage? {
    let data = string.data(using: .ascii)
    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(data, forKey: "inputMessage")
    guard let output = filter.outputImage else { return nil }
    let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    return UIImage(ciImage: scaled)
}
```

**Step 1:** Create TeamsManagementView (list + create sheet)
**Step 2:** Create TeamDetailView with variables, QR, players
**Step 3:** Add translation keys
**Step 4:** Build and test
**Step 5:** Commit: `feat(ios): add team management with variables and QR codes`

---

## Phase 11: Map Enhancements

### Task 20: Android Map Edit Mode

**Files:**
- Modify: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorMapScreen.kt`

**Additions to existing map:**
1. **Current location blue dot**: Enable `locationComponent` on the MapLibre map.
   ```kotlin
   mapView.location.apply {
       enabled = true
       pulsingEnabled = true
   }
   ```
2. **"Center on me" button**: FAB that calls `mapView.location.lastKnownLocation?.let { camera.flyTo(...) }`
3. **Edit mode toggle**: TopAppBar toggle button. When on:
   - Long-press map triggers `addOnMapLongClickListener` -> navigate to base create with coordinates
   - FAB "+" uses current GPS location -> navigate to base create with GPS coordinates
4. **Tap base marker**: Show `ModalBottomSheet` with base summary + Edit/Add Challenge/Write NFC actions
5. **Default edit mode**: ON when game status is "setup", OFF when "live"

**Step 1:** Add location component to MapLibre
**Step 2:** Add center-on-me FAB
**Step 3:** Add edit mode toggle with long-press handler
**Step 4:** Add "+" FAB for GPS-based base creation
**Step 5:** Add base tap bottom sheet with actions
**Step 6:** Add i18n strings
**Step 7:** Build and test
**Step 8:** Commit: `feat(android): add map edit mode with long-press base creation and GPS`

---

### Task 21: iOS Map Edit Mode

**Files:**
- Modify: `Features/Operator/OperatorMapView.swift`
- Modify: `Components/MapLibreMapView.swift` (add long-press support, user location)

**MapLibreMapView additions:**
```swift
// Add parameters:
var showsUserLocation: Bool = false
var onLongPress: ((CLLocationCoordinate2D) -> Void)?

// In Coordinator, add UILongPressGestureRecognizer to the map view
// On long press, convert point to coordinate and call the callback
```

**Step 1:** Extend MapLibreMapView with user location + long-press
**Step 2:** Add edit mode toggle to OperatorMapView
**Step 3:** Add center-on-me button
**Step 4:** Add "+" button for GPS-based creation
**Step 5:** Add base tap sheet with actions
**Step 6:** Add translation keys
**Step 7:** Build and test
**Step 8:** Commit: `feat(ios): add map edit mode with long-press base creation and GPS`

---

## Phase 12: Live Tab (Leaderboard + Activity)

### Task 22: Android Live Tab

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/LiveScreen.kt`

**ViewModel additions:**
```kotlin
// In OperatorState:
val leaderboard: List<LeaderboardEntry> = emptyList(),
val activity: List<ActivityEvent> = emptyList()

fun loadLeaderboard(gameId: String)
fun loadActivity(gameId: String)
```

**LiveScreen:** Top segmented buttons (Leaderboard | Activity). Content switches based on selection.

**Leaderboard segment:** LazyColumn of ranked team rows. Each row: rank number, team color dot, team name, points, completed count. First 3 highlighted.

**Activity segment:** LazyColumn of event cards. Each card: event type icon (check-in/submission/approval/rejection), team color badge, base/challenge name, timestamp. Newest first.

Both refresh via WebSocket events + manual pull-to-refresh.

**Step 1:** Add leaderboard/activity to OperatorState and ViewModel
**Step 2:** Create LiveScreen with segmented control
**Step 3:** Create leaderboard list composable
**Step 4:** Create activity feed composable
**Step 5:** Wire up real-time updates (listen to WebSocket events)
**Step 6:** Add i18n strings
**Step 7:** Build and test
**Step 8:** Commit: `feat(android): add live monitoring tab with leaderboard and activity feed`

---

### Task 23: iOS Live Tab

**Files:**
- Modify: `Features/Operator/OperatorLiveView.swift` (replace stub)

**Pattern:** `@State private var selectedSegment = 0` with `Picker` segmented style. Two list views switching based on segment.

**Step 1:** Implement OperatorLiveView with segmented control
**Step 2:** Create leaderboard list
**Step 3:** Create activity feed
**Step 4:** Wire up real-time updates via NotificationCenter
**Step 5:** Add translation keys
**Step 6:** Build and test
**Step 7:** Commit: `feat(ios): add live monitoring tab with leaderboard and activity feed`

---

## Phase 13: More Tab (Settings, Notifications, Operators, Export)

### Task 24: Android More Tab

**Files:**
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/MoreScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/GameSettingsScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/NotificationsScreen.kt`
- Create: `feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorsScreen.kt`

**MoreScreen:** Simple list of navigation items grouped in sections (Game, Data, App). Reuses existing language/theme pickers from current OperatorSettingsScreen. Add new items: Settings, Notifications, Operators, Export, Switch Game, Logout.

**GameSettingsScreen:** Form with: name, description, start date (DatePickerDialog), end date, uniform assignment toggle, tile source dropdown, broadcast toggle + code display. Save button calls `updateGame()`. Status transitions (Go Live / End Game) with confirmation dialogs.

**NotificationsScreen:** Top: message TextField + team Picker (all teams or specific) + Send button. Bottom: LazyColumn of sent notifications (message, target team, timestamp).

**OperatorsScreen:** List of current operators (name, email). "Invite" button -> dialog with email TextField -> calls `createInvite()`. List of pending invites.

**Export:** Button that calls `exportGame()`, serializes to JSON, launches Android share intent via `Intent.ACTION_SEND` with `text/json` MIME type.

**Step 1:** Create MoreScreen with navigation items
**Step 2:** Create GameSettingsScreen
**Step 3:** Create NotificationsScreen
**Step 4:** Create OperatorsScreen
**Step 5:** Add export share functionality
**Step 6:** Migrate existing language/theme/logout from OperatorSettingsScreen
**Step 7:** Wire up all routes
**Step 8:** Add i18n strings
**Step 9:** Build and test
**Step 10:** Commit: `feat(android): add more tab with settings, notifications, operators, and export`

---

### Task 25: iOS More Tab

**Files:**
- Modify: `Features/Operator/OperatorMoreView.swift` (replace stub)
- Create: `Features/Operator/GameSettingsView.swift`
- Create: `Features/Operator/NotificationsManagementView.swift`
- Create: `Features/Operator/OperatorsManagementView.swift`

**Pattern:** List with NavigationLinks for each item. Settings uses Form. Export uses `ShareLink` or `UIActivityViewController`.

**Step 1:** Implement OperatorMoreView with navigation
**Step 2:** Create GameSettingsView (form with date pickers)
**Step 3:** Create NotificationsManagementView (send + history)
**Step 4:** Create OperatorsManagementView (list + invite)
**Step 5:** Add export with share sheet
**Step 6:** Migrate language/theme/logout from existing OperatorSettingsView
**Step 7:** Add translation keys
**Step 8:** Build and test
**Step 9:** Commit: `feat(ios): add more tab with settings, notifications, operators, and export`

---

## Phase 14: Localization

### Task 26: Complete i18n for All New Screens

**Files:**
- Modify: `android-app/core/i18n/src/main/res/values/strings.xml`
- Modify: `android-app/core/i18n/src/main/res/values-de/strings.xml`
- Modify: `android-app/core/i18n/src/main/res/values-pt/strings.xml`
- Modify: `ios-app/dbv-nfc-games/App/Translations.swift`

Review all new screens and ensure every user-facing string uses the i18n system. Add missing translations for DE and PT. Key string categories:
- Navigation labels (Setup, Live, More)
- Setup hub (Needs Attention, Go Live, warning messages)
- Base management (all form labels, actions)
- Challenge management (all form labels, content sections, answer types)
- Rich text editor (toolbar tooltips, variable menu items)
- Team management (form labels, QR, variables)
- Live tab (Leaderboard, Activity, event type labels)
- More tab (all section headers, action labels)
- Settings (all field labels)
- Notifications (send, history labels)
- Operators (invite, remove labels)
- Export/Import labels
- Confirmation dialogs (delete, go live, end game)
- Error messages

**Step 1:** Audit all new Android screens for hardcoded strings
**Step 2:** Add missing EN strings to values/strings.xml
**Step 3:** Add DE translations to values-de/strings.xml
**Step 4:** Add PT translations to values-pt/strings.xml
**Step 5:** Audit all new iOS views for hardcoded strings
**Step 6:** Add all new keys to Translations.swift (en, pt, de dictionaries)
**Step 7:** Build both platforms to verify
**Step 8:** Commit: `feat: complete i18n for all new operator screens (EN, PT, DE)`

---

## Phase 15: Integration Testing and Polish

### Task 27: End-to-End Flow Testing

Manual testing checklist (no automated E2E -- focus on manual verification):

1. **Game creation flow**: Create empty game -> verify appears in list. Create game from import -> verify bases/challenges/teams created.
2. **Setup hub**: Verify warnings appear correctly. Verify tapping warnings navigates to correct screen. Verify Go Live button enables when ready.
3. **Base management**: Create base from list. Create base from map long-press. Create base from map GPS button. Edit base, drag pin. Delete base. Write NFC.
4. **Challenge management**: Create challenge. Edit content with rich text editor. Insert variable. Preview as team. Set answer type and correct answers. Link to base. Delete challenge.
5. **Team management**: Create team with color. Edit name and color. View QR code. Copy join code. Set variable values. Remove player. Delete team.
6. **Map edit mode**: Toggle edit on/off. Blue dot visible. Center on me. Long-press creates base. Tap base shows sheet with actions.
7. **Live tab**: Leaderboard shows ranked teams. Activity shows events. Both update in real-time.
8. **More tab**: Settings save correctly. Send notification to all teams. Send to specific team. Invite operator. Export game as JSON.
9. **Navigation transitions**: Setup mode shows correct tabs. Live mode shows correct tabs. Setup accessible from More when live.

**Step 1:** Test all flows on Android
**Step 2:** Test all flows on iOS
**Step 3:** Fix any bugs found
**Step 4:** Commit fixes: `fix: address issues found in integration testing`

---

### Task 28: Clean Up and Remove Old Code

**Files:**
- Potentially remove: old wizard-related code if any was merged from dev/mobile-operator
- Clean up: any temporary/placeholder screens

Ensure the `dev/mobile-operator` branch code is NOT merged. All new code is built fresh on main.

**Step 1:** Verify no code from dev/mobile-operator was accidentally included
**Step 2:** Remove any placeholder/TODO screens
**Step 3:** Final build verification on both platforms
**Step 4:** Commit: `chore: clean up placeholder code and verify builds`

---

## Execution Order Summary

The tasks have these dependencies:

```
Phase 1 (Android foundation: Tasks 1-3) ─┐
Phase 2 (iOS foundation: Tasks 4-5) ──────┤── Can run in parallel
                                           │
Phase 3 (Android nav: Task 6) ←── Task 1-3│
Phase 4 (iOS nav: Task 7) ←── Task 4-5    │
                                           │
Phase 5 (Game creation: Tasks 8-9) ←── Nav │
Phase 6 (Setup hub: Tasks 10-11) ←── Nav   │── Can run after nav
Phase 7 (Base mgmt: Tasks 12-13) ←── Nav   │
Phase 8 (Rich text: Tasks 14-15) ←── Found.│── Independent
Phase 9 (Challenge: Tasks 16-17) ←── RTE   │── Depends on rich text
Phase 10 (Teams: Tasks 18-19) ←── Nav      │── Can run after nav
Phase 11 (Map: Tasks 20-21) ←── Base mgmt  │── Depends on base mgmt
Phase 12 (Live: Tasks 22-23) ←── Nav       │── Can run after nav
Phase 13 (More: Tasks 24-25) ←── Nav       │── Can run after nav
Phase 14 (i18n: Task 26) ←── All features  │── After all features
Phase 15 (Testing: Tasks 27-28) ←── All    │── Last
```

**Optimal parallel execution:**
- Agent A: Android (Tasks 1, 2, 3, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24)
- Agent B: iOS (Tasks 4, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25)
- Then: Task 26 (i18n audit), Tasks 27-28 (testing)
