# Secure Journal (Raaz)

**Version:** 1.0 (Android APK)

## Overview

Secure Journal (Raaz) is a privacy-first, zero-knowledge journaling application designed to capture daily logs and fleeting thoughts.

The core philosophy is absolute privacy: all data is encrypted on the device before it ever reaches the cloud. This Zero-Knowledge Architecture ensures that no one—including the developers or cloud providers—can access or read your entries.

---

## Key Features

### Authentication & Security
The application prioritizes user security through a robust, multilayered authentication system.

* **Zero-Knowledge Architecture:** The server never receives or stores the user's password or decryption keys.
* **Secure Login:** Utilizes PBKDF2 hashing to derive encryption keys directly from the user's Passkey.
* **Biometric Unlock:** Supports FaceID and Fingerprint authentication for quick access to the vault without repeated manual entry.
* **Session Management:**
    * Instant logout capability clears biometric keys and session tokens immediately.
    * Rate limiting is enforced to prevent brute-force attacks (maximum 10 attempts per hour).

### Dual-Mode Journaling
Raaz offers two distinct writing modes to cater to different journaling styles.

**1. Daily Log (The Diary)**
* **Master Entry:** One consolidated entry per day.
* **Auto-Merge:** New writes are automatically merged into the existing daily entry.
* **Stale Draft Detection:** Detects unsynced drafts from previous days upon opening. It prompts the user to unlock and auto-uploads the data before clearing the interface for the new day.
* **Read-Only Mode:** Entries open in a locked state to prevent accidental modifications. Users must manually trigger edit mode.

**2. Thoughts (The Notes)**
* **Unlimited Entries:** Create as many separate entries as needed per day.
* **Custom Titles:** Assign specific titles (e.g., "Business Idea", "Rant") for better organization.
* **Auto-Clear:** The interface automatically clears after syncing to prepare for the next thought.

### Media & Attachments
Users can enrich their entries with rich media, which receives the same high-level encryption as text.

* **Rich Media Support:** Attach photos from the gallery or record in-app voice notes.
* **Local Encryption:** All images and audio files are encrypted locally using AES-256 before upload. Unauthorized viewers will only see garbage data.

### Sync & Cloud
* **Cloud Sync:** Securely uploads encrypted text and media to MongoDB (for metadata) and Supabase (for storage).
* **Local Drafts:** Progress is automatically saved to internal storage. If the network fails, data remains safe locally.
* **Manual Sync:** "Save Draft" and "Sync to Cloud" controls remain accessible even when the editor is locked.

### Archives & History
* **Calendar/List View:** Browse all past entries sorted chronologically.
* **Dual-View Feed:** Visual distinction between "Daily Logs" and "Thoughts" within the history feed.
* **Secure Decryption:** Historical entries remain encrypted in the list view until the user authenticates via Passkey or Biometrics.

### User Experience (UX)
* **Auto-Lock:** The visible editor locks automatically after saving or loading to prevent accidental pocket-dial edits.
* **Smart Buttons:** Sync and Save actions are decoupled from the edit state, ensuring data can always be pushed to the cloud.
* **Visual Feedback:** Clear indicators for vault status (Open vs. Closed).
* **Error Handling:** Comprehensive alerts for incorrect passkeys, network connectivity issues, or synchronization failures.

---

## Technical Architecture

The application is built on a modern stack designed for performance and security.

| Category | Technology |
| :--- | :--- |
| **Frontend** | React Native (Expo) |
| **Backend** | Node.js + Express (Deployed on Render) |
| **Database** | MongoDB Atlas |
| **File Storage** | Supabase |
| **Encryption** | AES-256 |
| **Key Storage** | Expo SecureStore |

---

## Security Protocol

**Data Encryption Standard**
All user data is encrypted using **AES-256** (Advanced Encryption Standard). This is a symmetric block cipher chosen to protect sensitive information.

**Key Derivation**
We utilize **PBKDF2** (Password-Based Key Derivation Function 2) to secure user passkeys. This adds a computational cost to password verification, making brute-force attacks significantly more difficult.
