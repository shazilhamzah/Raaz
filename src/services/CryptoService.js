import CryptoJS from 'crypto-js';
import 'react-native-get-random-values';

// Configuration
// PBKDF2 iterations: High enough to be slow for hackers, fast enough for us.
const KEY_ITERATIONS = 10000;
const KEY_SIZE = 256 / 32; // 256-bit key

const CryptoService = {

    /**
     * 1. DERIVE KEY
     * Turns a simple passkey (e.g., "1234") into a complex 256-bit cryptographic key.
     * We need a 'salt' (random string) which we will store in the user's DB profile.
     */
    deriveKey: (passkey, salt) => {
        const key = CryptoJS.PBKDF2(passkey, salt, {
            keySize: KEY_SIZE,
            iterations: KEY_ITERATIONS,
            hasher: CryptoJS.algo.SHA256
        });
        return key;
    },

    /**
     * 2. ENCRYPT (AES-CTR)
     * We use Counter Mode (CTR). 
     * Unlike other modes, CTR turns the cipher into a stream. 
     * If you decrypt with the wrong key, it doesn't fail/error; 
     * it just XORs the bits wrongly, producing the "Gibberish" you want.
     */
    encrypt: (text, derivedKey) => {
        // We generate a random IV (Initialization Vector) for every message
        // This ensures "Hello" encrypted twice looks different every time.
        const iv = CryptoJS.lib.WordArray.random(16);

        const encrypted = CryptoJS.AES.encrypt(text, derivedKey, {
            iv: iv,
            mode: CryptoJS.mode.CTR,
            padding: CryptoJS.pad.NoPadding
        });

        // We pack the IV and the Ciphertext together so we can separate them later
        // Format: IV_IN_HEX:CIPHERTEXT
        return iv.toString() + ':' + encrypted.toString();
    },

    /**
     * 3. DECRYPT
     * Takes the blob, splits the IV, and tries to unlock it.
     * If the key is wrong, this outputs GARBAGE (Gibberish).
     */
    /**
     * 3. DECRYPT (The Gibberish Update)
     */
    decrypt: (encryptedBlob, derivedKey) => {
        // 1. Split the IV and the Message
        const parts = encryptedBlob.split(':');
        if (parts.length !== 2) return "⚠️ Corrupted Data";

        const iv = CryptoJS.enc.Hex.parse(parts[0]);
        const ciphertext = parts[1];

        // 2. Perform the decryption math
        const decrypted = CryptoJS.AES.decrypt(ciphertext, derivedKey, {
            iv: iv,
            mode: CryptoJS.mode.CTR,
            padding: CryptoJS.pad.NoPadding
        });

        // 3. CONVERT TO TEXT
        // We try UTF-8 first (normal text). 
        // If that fails (because it's gibberish), we force Latin1 (raw symbols).
        try {
            // If the key is correct, this works perfectly.
            // If the key is wrong, this might return empty or throw error.
            const result = decrypted.toString(CryptoJS.enc.Utf8);

            // If result is empty (common with wrong keys in Utf8), throw to catch block
            if (!result) throw new Error("Invalid UTF-8");

            return result;
        } catch (e) {
            // 4. THE GIBBERISH FALLBACK
            // We force the raw bytes to be shown as Latin1 characters.
            // This produces the "¥©µ§" look you want.
            return decrypted.toString(CryptoJS.enc.Latin1);
        }
    }
};

export default CryptoService;