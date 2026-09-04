package com.prayer.pointfinder.securestore

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class KeyArgs {
    lateinit var key: String
}

@InvokeArg
class SetArgs {
    lateinit var key: String
    lateinit var value: String
}

/**
 * Values are AES-GCM encrypted with a non-exportable key living in the Android Keystore and
 * stored in a private SharedPreferences file as base64(iv) ":" base64(ciphertext).
 * If the key was lost (factory reset, restore on another device) the entry decrypts to null
 * and is dropped, so callers simply see "not logged in".
 */
@TauriPlugin
class SecureStorePlugin(private val activity: Activity) : Plugin(activity) {
    private val prefs: SharedPreferences by lazy {
        activity.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    @Command
    fun get(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        val value = read(args.key)
        val out = JSObject()
        out.put("value", value ?: JSONObject.NULL)
        invoke.resolve(out)
    }

    @Command
    fun set(invoke: Invoke) {
        val args = invoke.parseArgs(SetArgs::class.java)
        try {
            prefs.edit().putString(args.key, encrypt(args.value)).apply()
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Could not encrypt value: ${e.message}")
        }
    }

    @Command
    fun remove(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        prefs.edit().remove(args.key).apply()
        invoke.resolve()
    }

    @Command
    fun clear(invoke: Invoke) {
        prefs.edit().clear().apply()
        invoke.resolve()
    }

    @Command
    fun keys(invoke: Invoke) {
        val arr = JSArray()
        for (k in prefs.all.keys) arr.put(k)
        val out = JSObject()
        out.put("keys", arr)
        invoke.resolve(out)
    }

    private fun read(key: String): String? {
        val raw = prefs.getString(key, null) ?: return null
        return try {
            decrypt(raw)
        } catch (e: Exception) {
            prefs.edit().remove(key).apply()
            null
        }
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return b64(cipher.iv) + ":" + b64(ct)
    }

    private fun decrypt(stored: String): String {
        val sep = stored.indexOf(':')
        require(sep > 0) { "malformed entry" }
        val iv = Base64.decode(stored.substring(0, sep), Base64.NO_WRAP)
        val ct = Base64.decode(stored.substring(sep + 1), Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ct), Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

    companion object {
        private const val PREFS = "pointfinder.securestore"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "pointfinder.securestore.aes"
        private const val TRANSFORM = "AES/GCM/NoPadding"
    }
}
