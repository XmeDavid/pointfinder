package com.prayer.pointfinder.di

import android.content.Context
import android.util.Log
import androidx.room.Room
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.prayer.pointfinder.BuildConfig
import com.prayer.pointfinder.core.data.local.CompanionDatabase
import com.prayer.pointfinder.core.data.repo.OperatorTokenRefresher
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.network.ApiFactory
import com.prayer.pointfinder.core.network.AuthInterceptor
import com.prayer.pointfinder.core.network.AuthTokenProvider
import com.prayer.pointfinder.core.network.CompanionApi
import com.prayer.pointfinder.core.network.TokenAuthenticator
import com.prayer.pointfinder.core.network.TokenRefresher
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.UUID
import javax.inject.Singleton
import net.sqlcipher.database.SupportFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

@Module
@InstallIn(SingletonComponent::class)
abstract class AppBindingsModule {
    @Binds
    abstract fun bindAuthTokenProvider(store: SessionStore): AuthTokenProvider

    @Binds
    abstract fun bindTokenRefresher(refresher: OperatorTokenRefresher): TokenRefresher
}

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    @javax.inject.Named("refresh")
    fun provideRefreshOkHttpClient(): OkHttpClient {
        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(logger)
            .build()
    }

    @Provides
    @Singleton
    @javax.inject.Named("refresh")
    fun provideRefreshApi(@javax.inject.Named("refresh") okHttpClient: OkHttpClient): CompanionApi {
        return ApiFactory.buildApi(BuildConfig.API_BASE_URL, okHttpClient)
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        tokenProvider: AuthTokenProvider,
        tokenRefresher: TokenRefresher,
    ): OkHttpClient {
        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .authenticator(TokenAuthenticator(tokenRefresher))
            .addInterceptor(logger)
            .build()
    }

    @Provides
    @Singleton
    fun provideApi(okHttpClient: OkHttpClient): CompanionApi {
        return ApiFactory.buildApi(BuildConfig.API_BASE_URL, okHttpClient)
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): CompanionDatabase {
        // If an unencrypted DB exists from before the SQLCipher migration,
        // delete it so Room can create a fresh encrypted one. We detect this
        // by checking whether the passphrase has already been generated: if
        // not, any existing DB file is unencrypted and SQLCipher would crash
        // trying to open it (bad header), bypassing fallbackToDestructiveMigration().
        deleteOldUnencryptedDbIfNeeded(context)

        val passphrase = getOrCreateDbPassphrase(context)
        val factory = SupportFactory(passphrase)

        return Room.databaseBuilder(
            context,
            CompanionDatabase::class.java,
            DB_NAME,
        )
            .openHelperFactory(factory)
            .fallbackToDestructiveMigration()
            .build()
    }

    private const val DB_NAME = "companion-db"
    private const val DB_KEY_PREFS = "companion_db_key"
    private const val DB_PASSPHRASE_KEY = "db_passphrase"

    /**
     * If the SQLCipher passphrase hasn't been generated yet (first run with
     * encryption) but an old unencrypted DB file exists, delete it.
     * Cached game data will be re-fetched on next online session.
     */
    private fun deleteOldUnencryptedDbIfNeeded(context: Context) {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        val prefs = EncryptedSharedPreferences.create(
            context,
            DB_KEY_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        val passphraseExists = prefs.getString(DB_PASSPHRASE_KEY, null) != null
        if (passphraseExists) return // DB was already created with SQLCipher

        val dbFile = context.getDatabasePath(DB_NAME)
        if (dbFile.exists()) {
            Log.i("AppModule", "Migrating to encrypted DB: removing old unencrypted database")
            context.deleteDatabase(DB_NAME)
        }
    }

    /**
     * Returns a stable passphrase for SQLCipher, stored in EncryptedSharedPreferences.
     * Generated once on first launch, then reused.
     */
    private fun getOrCreateDbPassphrase(context: Context): ByteArray {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        val prefs = EncryptedSharedPreferences.create(
            context,
            DB_KEY_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        var passphrase = prefs.getString(DB_PASSPHRASE_KEY, null)
        if (passphrase == null) {
            passphrase = UUID.randomUUID().toString() + UUID.randomUUID().toString()
            prefs.edit().putString(DB_PASSPHRASE_KEY, passphrase).apply()
        }
        return passphrase.toByteArray()
    }
}
