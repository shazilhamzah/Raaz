import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto'; // <--- NEW IMPORT

// Configuration
const KEY_ITERATIONS = 10000;
const KEY_SIZE = 256 / 32;

// Helper: Generate secure random hex string using Expo Native Crypto
const generateRandomHex = (length) => {
    const randomBytes = Crypto.getRandomBytes(length);
    // Convert bytes to hex string
    return Array.from(randomBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

const CryptoService = {

    /**
     * 1. DERIVE KEY
     */
    deriveKey: (passkey, salt) => {
        const keyObject = CryptoJS.PBKDF2(passkey, salt, {
            keySize: KEY_SIZE,
            iterations: KEY_ITERATIONS,
            hasher: CryptoJS.algo.SHA256
        });
        return keyObject.toString(CryptoJS.enc.Hex);
    },

    /**
     * 2. ENCRYPT
     */
    encrypt: (text, derivedKeyHex) => {
        // Convert Hex String back to WordArray for math
        const key = CryptoJS.enc.Hex.parse(derivedKeyHex);

        // USE EXPO CRYPTO FOR IV (Fixes "Native module" error)
        const ivHex = generateRandomHex(16);
        const iv = CryptoJS.enc.Hex.parse(ivHex);

        const encrypted = CryptoJS.AES.encrypt(text, key, {
            iv: iv,
            mode: CryptoJS.mode.CTR,
            padding: CryptoJS.pad.NoPadding
        });
        return ivHex + ':' + encrypted.toString();
    },

    /**
     * 3. DECRYPT
     */
    decrypt: (encryptedBlob, derivedKeyHex) => {
        try {
            // Convert Hex String back to WordArray for math
            const key = CryptoJS.enc.Hex.parse(derivedKeyHex);

            const parts = encryptedBlob.split(':');
            if (parts.length !== 2) return { text: "⚠️ Corrupt", success: false };

            const iv = CryptoJS.enc.Hex.parse(parts[0]);
            const ciphertext = parts[1];

            const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
                iv: iv,
                mode: CryptoJS.mode.CTR,
                padding: CryptoJS.pad.NoPadding
            });

            // Try UTF-8
            try {
                const result = decrypted.toString(CryptoJS.enc.Utf8);
                if (!result) throw new Error("Invalid UTF-8");
                return { text: result, success: true };
            } catch (e) {
                // Return Gibberish if failed
                return {
                    text: decrypted.toString(CryptoJS.enc.Latin1),
                    success: false
                };
            }
        } catch (e) {
            return { text: "⚠️ Error", success: false };
        }
    }
};

export default CryptoService;