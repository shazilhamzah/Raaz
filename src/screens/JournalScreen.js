import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Keyboard, TouchableOpacity, Image, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import CryptoService from '../services/CryptoService';

export default function JournalScreen() {
    const { userToken, journalKey, unlockVault, userSalt } = useContext(AuthContext);

    // --- ACTIVE STATE (What you see on screen) ---
    const [entryType, setEntryType] = useState('JOURNAL'); // 'JOURNAL' or 'THOUGHT'
    const [text, setText] = useState('');
    const [thoughtTitle, setThoughtTitle] = useState(''); // Specific to thoughts
    const [images, setImages] = useState([]);
    const [voiceNotes, setVoiceNotes] = useState([]);

    // --- OFF-SCREEN STATE (Memory to hold the other tab) ---
    // We use refs or state? State is safer for rendering, but refs are fine for storage. 
    // Let's use State to ensure we don't lose data.
    const [journalDraft, setJournalDraft] = useState({ text: '', images: [], voiceNotes: [] });
    const [thoughtDraft, setThoughtDraft] = useState({ text: '', images: [], voiceNotes: [], title: '' });

    // System State
    const [passkeyInput, setPasskeyInput] = useState('');
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [recording, setRecording] = useState(null);
    const [uploading, setUploading] = useState(false);

    // 1. Load Journal Draft on Mount
    useEffect(() => {
        loadInitialDraft();
    }, []);

    const loadInitialDraft = async () => {
        try {
            // Load Journal Draft by default
            const savedText = await AsyncStorage.getItem('draft_journal_text');
            const savedImages = await AsyncStorage.getItem('draft_journal_images');
            const savedVoice = await AsyncStorage.getItem('draft_journal_voice');

            if (savedText) setText(savedText);
            if (savedImages) setImages(JSON.parse(savedImages));
            if (savedVoice) setVoiceNotes(JSON.parse(savedVoice));

            // Update the 'memory' too so we don't overwrite it with empty data on first switch
            setJournalDraft({
                text: savedText || '',
                images: savedImages ? JSON.parse(savedImages) : [],
                voiceNotes: savedVoice ? JSON.parse(savedVoice) : []
            });

        } catch (e) { console.log("Load Error", e); }
    };

    // --- MODE SWITCHING LOGIC ---
    const switchMode = (newMode) => {
        if (newMode === entryType) return; // No change

        if (newMode === 'THOUGHT') {
            // 1. SAVE current Journal state to memory & storage
            const currentJournalState = { text, images, voiceNotes };
            setJournalDraft(currentJournalState);
            saveDraftToStorage('JOURNAL', currentJournalState);

            // 2. LOAD Thought state from memory
            setText(thoughtDraft.text);
            setImages(thoughtDraft.images);
            setVoiceNotes(thoughtDraft.voiceNotes);
            setThoughtTitle(thoughtDraft.title);

            setEntryType('THOUGHT');

        } else {
            // 1. SAVE current Thought state to memory & storage
            const currentThoughtState = { text, images, voiceNotes, title: thoughtTitle };
            setThoughtDraft(currentThoughtState);
            saveDraftToStorage('THOUGHT', currentThoughtState);

            // 2. LOAD Journal state from memory
            setText(journalDraft.text);
            setImages(journalDraft.images);
            setVoiceNotes(journalDraft.voiceNotes);

            setEntryType('JOURNAL');
        }
    };

    // Helper to save to phone disk
    const saveDraftToStorage = async (type, data) => {
        try {
            const prefix = type === 'JOURNAL' ? 'draft_journal' : 'draft_thought';
            await AsyncStorage.setItem(`${prefix}_text`, data.text);
            await AsyncStorage.setItem(`${prefix}_images`, JSON.stringify(data.images));
            await AsyncStorage.setItem(`${prefix}_voice`, JSON.stringify(data.voiceNotes));
            if (type === 'THOUGHT') {
                await AsyncStorage.setItem(`${prefix}_title`, data.title || '');
            }
        } catch (e) { console.log("Save Error", e); }
    };

    // Manual Save Button Handler
    const handleManualSave = () => {
        if (entryType === 'JOURNAL') {
            const data = { text, images, voiceNotes };
            setJournalDraft(data); // Update memory
            saveDraftToStorage('JOURNAL', data); // Update disk
        } else {
            const data = { text, images, voiceNotes, title: thoughtTitle };
            setThoughtDraft(data);
            saveDraftToStorage('THOUGHT', data);
        }
        Alert.alert("Draft Saved", `Your ${entryType.toLowerCase()} is saved locally.`);
        Keyboard.dismiss();
    };

    // --- MEDIA FUNCTIONS ---
    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'Images', allowsEditing: false, quality: 0.5 });
        if (!result.canceled) setImages([...images, result.assets[0].uri]);
    };

    const startRecording = async () => {
        try {
            const perm = await Audio.requestPermissionsAsync();
            if (perm.status !== 'granted') return;
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(recording);
        } catch (err) { }
    };

    const stopRecording = async () => {
        setRecording(undefined);
        await recording.stopAndUnloadAsync();
        setVoiceNotes([...voiceNotes, recording.getURI()]);
    };

    // --- SYNC LOGIC ---
    const handleSyncToCloud = async () => {
        // 1. STRICT CHECK: Do we have the Master Key?
        if (journalKey) {
            performCloudUpload(journalKey);
        } else {
            // 2. No Key? Force User to Unlock
            setModalMessage("Unlock Vault to Sync");
            setShowSyncModal(true);
        }
    };

    const emergencyLogout = async () => {
        try {
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('userSalt');
            await AsyncStorage.removeItem('auth_canary'); // <--- The corrupted file
            await SecureStore.deleteItemAsync('user_passkey');

            // Force reload or just alert
            Alert.alert("Reset Complete", "Please restart the app and Login again.");
            // In a real app, you'd trigger a navigation reset here, 
            // but for now, just manually killing the app works.
            logout(); // Call the context logout if available
        } catch (e) {
            console.log(e);
        }
    };

    const performCloudUpload = async (key) => {
        if (!text.trim() && images.length === 0 && voiceNotes.length === 0) return;
        setUploading(true);

        // 1. AUTO-SAVE DRAFT (Requirement 1)
        // We save exactly what is on screen right now before attempting upload
        if (entryType === 'JOURNAL') {
            saveDraftToStorage('JOURNAL', { text, images, voiceNotes });
        } else {
            saveDraftToStorage('THOUGHT', { text, images, voiceNotes, title: thoughtTitle });
        }

        try {
            const today = new Date().toISOString().split('T')[0];

            // Determine Title
            let finalTitle = "Daily Log";
            if (entryType === 'THOUGHT') {
                finalTitle = thoughtTitle.trim() || `Thought @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }

            const encryptedText = CryptoService.encrypt(text, key);

            // Encrypt Media
            let encryptedImagesList = [];
            for (const uri of images) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedImagesList.push(CryptoService.encrypt(base64, key));
            }

            let encryptedAudioList = [];
            for (const uri of voiceNotes) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedAudioList.push(CryptoService.encrypt(base64, key));
            }

            // Upload
            await api.post('/entries', {
                date: today,
                title: finalTitle,
                content: encryptedText,
                media: encryptedImagesList,
                audio: encryptedAudioList,
                type: entryType
            }, { headers: { 'x-auth-token': userToken } });

            Alert.alert("✅ Secured", `${entryType === 'THOUGHT' ? "Thought" : "Journal"} uploaded!`);

            // CLEANUP
            if (entryType === 'THOUGHT') {
                // Thoughts are one-off: Clear everything
                setText('');
                setImages([]);
                setVoiceNotes([]);
                setThoughtTitle('');
                setThoughtDraft({ text: '', images: [], voiceNotes: [], title: '' });
                AsyncStorage.multiRemove(['draft_thought_text', 'draft_thought_images', 'draft_thought_voice', 'draft_thought_title']);
            } else {
                // Journal: Keep Text (usually), but clear media to avoid dupes?
                // User preference: "We KEEP the text".
                // We MUST clear media arrays to prevent duplicate uploads next time
                setImages([]);
                setVoiceNotes([]);
                // Update the memory draft to match the cleared media
                setJournalDraft(prev => ({ ...prev, images: [], voiceNotes: [] }));
                // Update storage
                saveDraftToStorage('JOURNAL', { text, images: [], voiceNotes: [] });
            }

            setShowSyncModal(false);
            setPasskeyInput('');
        } catch (error) {
            console.log("Upload Error:", error);
            Alert.alert("Error", "Upload failed. Draft saved locally.");
        } finally {
            setUploading(false);
        }
    };

    const handleUnlockAndSync = async () => {
        // 1. Attempt to unlock (Runs Canary Check inside AuthContext)
        const success = await unlockVault(passkeyInput);

        if (success) {
            // Wait for useEffect to handle Stale, or manual logic to handle Sync
            if (!staleDraft) {
                const key = CryptoService.deriveKey(passkeyInput, userSalt);
                performCloudUpload(key);
            }
        } else {
            // 3. Failure! Wrong passkey.
            Alert.alert("⛔ Access Denied", "Wrong Passkey. Please try again.");
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.date}>{new Date().toDateString()}</Text>
                    <Text style={styles.status}>{journalKey ? "🔓 Vault Open" : "📱 Local Mode"}</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <Text style={{ fontSize: 18 }}>🚪 Logout</Text>
                </TouchableOpacity>
            </View>

            {/* --- TOGGLE BUTTONS --- */}
            <View style={styles.toggleContainer}>
                <TouchableOpacity
                    style={[styles.toggleBtn, entryType === 'JOURNAL' && styles.toggleBtnActive]}
                    onPress={() => switchMode('JOURNAL')}
                >
                    <Text style={[styles.toggleText, entryType === 'JOURNAL' && styles.toggleTextActive]}>📖 Daily Log</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.toggleBtn, entryType === 'THOUGHT' && styles.toggleBtnActive]}
                    onPress={() => switchMode('THOUGHT')}
                >
                    <Text style={[styles.toggleText, entryType === 'THOUGHT' && styles.toggleTextActive]}>💡 Thought</Text>
                </TouchableOpacity>
            </View>

            {/* --- THOUGHT TITLE BAR (Requirement 2) --- */}
            {entryType === 'THOUGHT' && (
                <TextInput
                    style={styles.titleInput}
                    placeholder="Title (e.g., 'Million Dollar Idea')"
                    value={thoughtTitle}
                    onChangeText={setThoughtTitle}
                />
            )}

            <TextInput
                style={styles.editor}
                multiline
                placeholder={entryType === 'JOURNAL' ? "How was your day?" : "What's on your mind?"}
                value={text}
                onChangeText={setText}
                textAlignVertical="top"
            />

            {/* --- MEDIA PREVIEWS --- */}
            {images.length > 0 && (
                <View style={{ height: 80, marginBottom: 10 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {images.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 10 }} />)}
                    </ScrollView>
                </View>
            )}

            {/* --- ACTION AREA --- */}
            <View style={styles.actionArea}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Button title="📸 Photo" onPress={pickImage} />
                    <Button title={recording ? "⏹ Stop" : "🎤 Voice"} onPress={recording ? stopRecording : startRecording} color={recording ? "red" : "blue"} />
                </View>

                {voiceNotes.length > 0 && <Text style={{ marginBottom: 10, color: 'green', textAlign: 'center' }}>{voiceNotes.length} Voice Note(s) recorded</Text>}

                <View style={styles.buttonRow}>
                    <Button title="Save Draft" onPress={handleManualSave} color="#666" />
                    <View style={{ width: 20 }} />
                    <Button
                        title={uploading ? "Encrypting..." : `🔒 Sync ${entryType === 'THOUGHT' ? "Thought" : "Log"}`}
                        onPress={handleSyncToCloud}
                        disabled={uploading}
                        color="#8a2be2"
                    />
                </View>
            </View>

            {/* --- MODAL --- */}
            {showSyncModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <TextInput style={styles.modalInput} placeholder="Passkey" secureTextEntry value={passkeyInput} onChangeText={setPasskeyInput} />
                        <Button title="Unlock & Upload" onPress={handleUnlockAndSync} />
                        <TouchableOpacity onPress={() => setShowSyncModal(false)}><Text style={{ color: 'red', textAlign: 'center', marginTop: 15 }}>Cancel</Text></TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}
// HIBA
const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    date: { fontSize: 18, fontWeight: 'bold' },
    status: { fontSize: 12, color: 'blue', marginTop: 4 },

    toggleContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 4, marginBottom: 10 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    toggleBtnActive: { backgroundColor: 'white', shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2 },
    toggleText: { fontWeight: '600', color: '#666' },
    toggleTextActive: { color: '#000' },

    titleInput: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', fontWeight: 'bold' },
    editor: { flex: 1, backgroundColor: 'white', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },

    actionArea: { marginBottom: 10 },
    buttonRow: { flexDirection: 'row', justifyContent: 'center' },

    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 15, width: '80%', elevation: 5 },
    modalInput: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 5, marginBottom: 15 },
});