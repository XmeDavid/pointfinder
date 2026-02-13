package com.prayer.pointfinder.core.data.local

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.CheckInResponse

@Entity(tableName = "pending_actions")
data class PendingActionEntity(
    @PrimaryKey val id: String,
    val type: String,
    val gameId: String,
    val baseId: String,
    val challengeId: String?,
    val answer: String?,
    val createdAtEpochMs: Long,
    val retryCount: Int,
)

@Entity(tableName = "cached_progress", primaryKeys = ["gameId", "baseId"])
data class CachedProgressEntity(
    val gameId: String,
    val baseId: String,
    val baseName: String,
    val lat: Double,
    val lng: Double,
    val nfcLinked: Boolean,
    val requirePresenceToSubmit: Boolean,
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
)

@Dao
interface PendingActionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PendingActionEntity)

    @Query("SELECT * FROM pending_actions ORDER BY createdAtEpochMs ASC")
    suspend fun pendingActions(): List<PendingActionEntity>

    @Query("SELECT COUNT(*) FROM pending_actions")
    suspend fun pendingCount(): Int

    @Query(
        "SELECT COUNT(*) > 0 FROM pending_actions " +
            "WHERE gameId = :gameId AND baseId = :baseId AND type = 'check_in'",
    )
    suspend fun hasPendingCheckIn(gameId: String, baseId: String): Boolean

    @Query("DELETE FROM pending_actions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE pending_actions SET retryCount = retryCount + 1 WHERE id = :id")
    suspend fun incrementRetryCount(id: String)

    @Query("DELETE FROM pending_actions")
    suspend fun clearAll()
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
    version = 1,
    exportSchema = false,
)
abstract class CompanionDatabase : RoomDatabase() {
    abstract fun pendingActionDao(): PendingActionDao
    abstract fun progressDao(): ProgressDao
    abstract fun challengeDao(): ChallengeDao
}

fun BaseProgress.toCached(gameId: String): CachedProgressEntity {
    return CachedProgressEntity(
        gameId = gameId,
        baseId = baseId,
        baseName = baseName,
        lat = lat,
        lng = lng,
        nfcLinked = nfcLinked,
        requirePresenceToSubmit = requirePresenceToSubmit,
        status = status,
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
        requirePresenceToSubmit = requirePresenceToSubmit,
        status = status,
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
    )
}
