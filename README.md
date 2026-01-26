# Secure Journal (Raaz)

**Version:** 1.0 (Android APK)

## Overview

Raaz is a privacy-first, zero-knowledge journaling application that allows users to record daily logs and fleeting thoughts. All data is encrypted on the device before reaching the cloud, ensuring that not even the developers can read the user's entries.

## Key Features

### 1. Authentication & Security
*   **Zero-Knowledge Architecture:** The server never sees the user's password or decryption key.
*   **Secure Login:** PBKDF2 Hashing is used to derive encryption keys from the user's Passkey.
*   **Biometric Unlock:** Support for FaceID and Fingerprint to unlock the vault without typing the passkey every time.
*   **Session Management:**
    *   "Logout" button instantly clears the biometric key and session token.
    *   **Rate Limiting:** Prevents brute-force attacks on the login screen (max 10 attempts/hour).

### 2. Dual-Mode Journaling
**A. Daily Log (The "Diary")**
*   One master entry per day.
*   Auto-merges new writes into the existing daily entry.
*   **"Stale Draft" Detection:** If the user forgets to sync yesterday, the app detects the old draft upon opening and auto-uploads it (or prompts for unlock) before clearing the screen for a new day.
*   **Read-Only Mode:** Opens in a locked state to prevent accidental deletion. User must tap "✏️" to edit.

**B. Thoughts (The "Notes")**
*   Unlimited entries per day.
*   Separate from the Daily Log.
*   Custom titles for each thought (e.g., "Business Idea", "Rant").
*   Auto-clears after sync to allow for the next thought.

### 3. Media & Attachments
*   **Rich Media Support:** Users can attach:
    *   Photos (from Gallery)
    *   Voice Notes (In-app Recorder)
*   **Encrypted Media:** All images and audio files are encrypted locally (AES-256) before upload. They look like garbage data to anyone without the key.

### 4. Sync & Cloud
*   **Cloud Sync:** Securely uploads encrypted text and media to MongoDB (metadata) and Supabase (storage).
*   **Local Drafts:** Automatically saves progress to the phone's internal storage. If the internet cuts out, data is safe locally.
*   **Manual Sync:** "Save Draft" and "Sync to Cloud" buttons available even when the editor is locked.

### 5. Archives & History
*   **Calendar/List View:** View all past entries sorted by date.
*   **Dual-View List:** Visual distinction between "📖 Daily Logs" and "💡 Thoughts" in the history feed.
*   **Secure Decryption:** Entries in the list remain encrypted (gibberish) until the user authenticates via Passkey or Biometrics.

### 6. User Experience (UX)
*   **Auto-Lock:** The visible editor locks itself after saving or loading to prevent "pocket-dial" edits.
*   **Smart Buttons:** Sync/Save buttons remain active even when editing is locked.
*   **Visual Feedback:** "Vault Open/Closed" status indicators.
*   **Error Handling:** Alerts for wrong passkeys, network issues, or sync failures.

## Technical Stack

*   **Frontend:** React Native (Expo)
*   **Backend:** Node.js + Express (Deployed on Render)
*   **Database:** MongoDB Atlas
*   **File Storage:** Supabase
*   **Security:** AES-256 Encryption, Expo SecureStore

## Project Structure

```
raaz-frontend/
├── assets/             # Images and static assets
├── src/
│   ├── config/         # App configuration
│   ├── context/        # React Context (e.g., AuthContext)
│   ├── screens/        # Application screens
│   │   ├── JournalScreen.js    # Main journaling interface (Daily Logs/Thoughts)
│   │   ├── LoginScreen.js      # Authentication & Unlock
│   │   ├── LogsScreen.js       # History/Archives view
│   │   └── CryptoPlayground.js # Encryption testing
│   ├── services/       # Business logic and services
│   │   ├── api.js              # API interaction (MongoDB/Express)
│   │   └── CryptoService.js    # Encryption (AES-256) & Key derivation
├── App.js              # Main application entry point
└── app.json            # Expo configuration
```

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd raaz-frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the application:
    ```bash
    npx expo start
    ```
