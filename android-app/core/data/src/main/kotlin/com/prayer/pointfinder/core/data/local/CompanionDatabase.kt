package com.prayer.pointfinder.core.data.local

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.prayer.pointfinder.core.model.BaseProgress
import kotlinx.coroutines.flow.Flow
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse

@Entity(
    tableName = "pending_actions",
    indices = [
        Index(value = ["gameId", "baseId", "type"]),
        Index(value = ["permanentlyFailed"]),
    ],
)
data class PendingActionEntity(
    @PrimaryKey val id: String,
    val type: String,
    val gameId: String,
    val baseId: String,
    val challengeId: String?,
    val answer: String?,
    val createdAtEpochMs: Long,
    val retryCount: Int,
    val mediaContentType: String? = null,
    val mediaLocalPath: String? = null,
    val mediaSourceUri: String? = null,
    val mediaSizeBytes: Long? = null,
    val mediaFileName: String? = null,
    val uploadSessionId: String? = null,
    val uploadChunkIndex: Int? = null,
    val uploadTotalChunks: Int? = null,
    val requiresReselect: Boolean = false,
    val lastError: String? = null,
    /** JSON-encoded list of media items for multi-media submissions. */
    val mediaItemsJson: String? = null,
    val permanentlyFailed: Boolean = false,
    val failureReason: String? = null,
)

@Entity(tableName = "cached_progress", primaryKeys = ["gameId", "baseId"])
data class CachedProgressEntity(
    val gameId: String,
    val baseId: String,
    val baseName: String,
    val lat: Double,
    val lng: Double,
    val nfcLinked: Boolean,
    val status: String,
    val checkedInAt: String?,
    val challengeId: String?,
    val submissionStatus: String?,
)

@Entity(tableName = "cached_challenge", primaryKeys = ["gameId", "teamId", "baseId"])
data class CachedChallengeEntity(
    val gameId: String,
    val teamId: String,
    val baseId: String,
    val id: String,
    val title: String,
    val description: String,
    val content: String,
    val completionContent: String?,
    val answerType: String,
    val points: Int,
    val requirePresenceToSubmit: Boolean = false,
)

@Dao
interface PendingActionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PendingActionEntity)

    @Query("SELECT * FROM pending_actions ORDER BY createdAtEpochMs ASC")
    suspend fun pendingActions(): List<PendingActionEntity>

    @Query("SELECT COUNT(*) FROM pending_actions")
    suspend fun pendingCount(): Int

    @Query("SELECT COUNT(*) FROM pending_actions")
    fun pendingCountFlow(): Flow<Int>

    @Query(
        "SELECT COUNT(*) > 0 FROM pending_actions " +
            "WHERE gameId = :gameId AND baseId = :baseId AND type = 'check_in'",
    )
    suspend fun hasPendingCheckIn(gameId: String, baseId: String): Boolean

    @Query("DELETE FROM pending_actions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM pending_actions WHERE id = :id LIMIT 1")
    suspend fun findById(id: String): PendingActionEntity?

    @Query("UPDATE pending_actions SET retryCount = retryCount + 1 WHERE id = :id")
    suspend fun incrementRetryCount(id: String)

    @Query(
        """
        UPDATE pending_actions
        SET uploadSessionId = :uploadSessionId,
            uploadChunkIndex = :uploadChunkIndex,
            uploadTotalChunks = :uploadTotalChunks,
            lastError = :lastError
        WHERE id = :id
        """,
    )
    suspend fun updateUploadProgress(
        id: String,
        uploadSessionId: String?,
        uploadChunkIndex: Int?,
        uploadTotalChunks: Int?,
        lastError: String?,
    )

    @Query(
        """
        UPDATE pending_actions
        SET requiresReselect = :requiresReselect,
            lastError = :lastError
        WHERE id = :id
        """,
    )
    suspend fun updateNeedsReselect(id: String, requiresReselect: Boolean, lastError: String?)

    @Query("DELETE FROM pending_actions")
    suspend fun clearAll()

    @Query("UPDATE pending_actions SET permanentlyFailed = 1, failureReason = :reason WHERE id = :id")
    suspend fun markPermanentlyFailed(id: String, reason: String)

    @Query("SELECT * FROM pending_actions WHERE permanentlyFailed = 1")
    suspend fun getFailedActions(): List<PendingActionEntity>

    @Query("SELECT COUNT(*) FROM pending_actions WHERE gameId = :gameId AND permanentlyFailed = 1")
    suspend fun getPermanentlyFailedCount(gameId: String): Int
}

@Dao
interface ProgressDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entries: List<CachedProgressEntity>)

    @Query("SELECT * FROM cached_progress WHERE gameId = :gameId")
    suspend fun progressForGame(gameId: String): List<CachedProgressEntity>

    @Query("DELETE FROM cached_progress WHERE gameId = :gameId")
    suspend fun deleteForGame(gameId: String)

    @Query("DELETE FROM cached_progress")
    suspend fun clearAll()

    @Query("UPDATE cached_progress SET status = :status WHERE gameId = :gameId AND baseId = :baseId")
    suspend fun updateStatus(gameId: String, baseId: String, status: String)

    @Query("UPDATE cached_progress SET submissionStatus = :submissionStatus WHERE gameId = :gameId AND baseId = :baseId")
    suspend fun updateSubmissionStatus(gameId: String, baseId: String, submissionStatus: String?)
}

@Dao
interface ChallengeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CachedChallengeEntity)

    @Query("SELECT * FROM cached_challenge WHERE gameId = :gameId AND teamId = :teamId AND baseId = :baseId LIMIT 1")
    suspend fun challengeForBase(gameId: String, teamId: String, baseId: String): CachedChallengeEntity?

    @Query("DELETE FROM cached_challenge")
    suspend fun clearAll()
}

@Database(
    entities = [
        PendingActionEntity::class,
        CachedProgressEntity::class,
        CachedChallengeEntity::class,
    ],
    version = 5,
    exportSchema = true,
)
abstract class CompanionDatabase : RoomDatabase() {
    abstract fun pendingActionDao(): PendingActionDao
    abstract fun progressDao(): ProgressDao
    abstract fun challengeDao(): ChallengeDao
}

val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE pending_actions ADD COLUMN permanentlyFailed INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE pending_actions ADD COLUMN failureReason TEXT")
    }
}

val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Move requirePresenceToSubmit from cached_progress to cached_challenge
        db.execSQL("CREATE TABLE cached_progress_new (gameId TEXT NOT NULL, baseId TEXT NOT NULL, baseName TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, nfcLinked INTEGER NOT NULL, status TEXT NOT NULL, checkedInAt TEXT, challengeId TEXT, submissionStatus TEXT, PRIMARY KEY(gameId, baseId))")
        db.execSQL("INSERT INTO cached_progress_new (gameId, baseId, baseName, lat, lng, nfcLinked, status, checkedInAt, challengeId, submissionStatus) SELECT gameId, baseId, baseName, lat, lng, nfcLinked, status, checkedInAt, challengeId, submissionStatus FROM cached_progress")
        db.execSQL("DROP TABLE cached_progress")
        db.execSQL("ALTER TABLE cached_progress_new RENAME TO cached_progress")
        db.execSQL("ALTER TABLE cached_challenge ADD COLUMN requirePresenceToSubmit INTEGER NOT NULL DEFAULT 0")
    }
}

fun BaseProgress.toCached(gameId: String): CachedProgressEntity {
    return CachedProgressEntity(
        gameId = gameId,
        baseId = baseId,
        baseName = baseName,
        lat = lat,
        lng = lng,
        nfcLinked = nfcLinked,
        status = status.name.lowercase(),
        checkedInAt = checkedInAt,
        challengeId = challengeId,
        submissionStatus = submissionStatus,
    )
}

fun CachedProgressEntity.toBaseProgress(): BaseProgress {
    return BaseProgress(
        baseId = baseId,
        baseName = baseName,
        lat = lat,
        lng = lng,
        nfcLinked = nfcLinked,
        status = BaseStatus.valueOf(status.uppercase()),
        checkedInAt = checkedInAt,
        challengeId = challengeId,
        submissionStatus = submissionStatus,
    )
}

fun CheckInResponse.ChallengeInfo.toCached(
    gameId: String,
    teamId: String,
    baseId: String,
): CachedChallengeEntity {
    return CachedChallengeEntity(
        gameId = gameId,
        teamId = teamId,
        baseId = baseId,
        id = id,
        title = title,
        description = description,
        content = content,
        completionContent = completionContent,
        answerType = answerType,
        points = points,
        requirePresenceToSubmit = requirePresenceToSubmit,
    )
}

fun CachedChallengeEntity.toChallengeInfo(): CheckInResponse.ChallengeInfo {
    return CheckInResponse.ChallengeInfo(
        id = id,
        title = title,
        description = description,
        content = content,
        completionContent = completionContent,
        answerType = answerType,
        points = points,
        requirePresenceToSubmit = requirePresenceToSubmit,
    )
}
