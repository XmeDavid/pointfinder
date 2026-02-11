package com.dbv.companion.di

import android.content.Context
import androidx.room.Room
import com.dbv.companion.BuildConfig
import com.dbv.companion.core.data.local.CompanionDatabase
import com.dbv.companion.core.data.repo.OperatorTokenRefresher
import com.dbv.companion.core.data.repo.SessionStore
import com.dbv.companion.core.network.ApiFactory
import com.dbv.companion.core.network.AuthInterceptor
import com.dbv.companion.core.network.AuthTokenProvider
import com.dbv.companion.core.network.CompanionApi
import com.dbv.companion.core.network.TokenAuthenticator
import com.dbv.companion.core.network.TokenRefresher
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
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
        return Room.databaseBuilder(
            context,
            CompanionDatabase::class.java,
            "companion-db",
        ).fallbackToDestructiveMigration().build()
    }
}
