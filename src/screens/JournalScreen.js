import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Keyboard, TouchableOpacity, Image, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { AuthContext } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store'; // Needed for reset button
import api from '../services/api';
import CryptoService from '../services/CryptoService';

export default function JournalScreen() {
    const { userToken, journalKey, unlockVault, userSalt, unlockWithBiometrics, logout } = useContext(AuthContext);

    // --- STATE ---
    const [entryType, setEntryType] = useState('JOURNAL');
    const [text, setText] = useState('');
    const [thoughtTitle, setThoughtTitle] = useState('');
    const [images, setImages] = useState([]);
    const [voiceNotes, setVoiceNotes] = useState([]);

    const [isEditable, setIsEditable] = useState(true);
    const [journalDraft, setJournalDraft] = useState({ text: '', images: [], voiceNotes: [] });
    const [thoughtDraft, setThoughtDraft] = useState({ text: '', images: [], voiceNotes: [], title: '' });
    const [staleDraft, setStaleDraft] = useState(null);

    const [passkeyInput, setPasskeyInput] = useState('');
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [modalMessage, setModalMessage] = useState(null);
    const [recording, setRecording] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => { loadInitialDraft(); }, []);

    useEffect(() => {
        if (journalKey && staleDraft) {
            uploadStaleDraft(journalKey, staleDraft);
        }
    }, [journalKey, staleDraft]);

    const loadInitialDraft = async () => {
        try {
            const todayStr = new Date().toDateString();
            const jText = await AsyncStorage.getItem('draft_journal_text');
            const jImages = await AsyncStorage.getItem('draft_journal_images');
            const jVoice = await AsyncStorage.getItem('draft_journal_voice');
            const jDate = await AsyncStorage.getItem('draft_journal_date');

            const parsedJImages = jImages ? JSON.parse(jImages) : [];
            const parsedJVoice = jVoice ? JSON.parse(jVoice) : [];

            if (jDate && jDate !== todayStr && (jText || parsedJImages.length > 0)) {
                console.log("Found stale draft");
                setText('');
                setImages([]);
                setVoiceNotes([]);
                setIsEditable(true);

                const staleData = {
                    text: jText,
                    images: parsedJImages,
                    voiceNotes: parsedJVoice,
                    date: jDate,
                    type: 'JOURNAL'
                };
                setStaleDraft(staleData);
                processStaleDraft(staleData);
            } else {
                setText(jText || '');
                setImages(parsedJImages);
                setVoiceNotes(parsedJVoice);
                setJournalDraft({ text: jText || '', images: parsedJImages, voiceNotes: parsedJVoice });

                const hasContent = (jText && jText.trim().length > 0) || parsedJImages.length > 0 || parsedJVoice.length > 0;
                if (hasContent) setIsEditable(false);
                else setIsEditable(true);
            }
        } catch (e) { console.log("Load Error", e); }
    };

    const processStaleDraft = async (draft) => {
        const verifiedKey = await unlockWithBiometrics();
        // If biometrics works, it returns the KEY now.
        if (verifiedKey && typeof verifiedKey === 'string') {
            Alert.alert("🔄 Auto-Sync", `Uploading unsent entry from ${draft.date}...`);
            // uploadStaleDraft triggers automatically via useEffect when journalKey updates
        } else {
            setModalMessage(`Found unsent entry from ${draft.date}. Enter Passkey to save it.`);
            setShowSyncModal(true);
        }
    };

    const uploadStaleDraft = async (key, draft) => {
        if (uploading) return;
        setUploading(true);
        try {
            const encryptedText = CryptoService.encrypt(draft.text || '', key);
            let encryptedImagesList = [];
            for (const uri of draft.images) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedImagesList.push(CryptoService.encrypt(base64, key));
            }
            let encryptedAudioList = [];
            for (const uri of draft.voiceNotes) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedAudioList.push(CryptoService.encrypt(base64, key));
            }
            const dateObj = new Date(draft.date);
            const isoDate = dateObj.toISOString().split('T')[0];

            await api.post('/entries', {
                date: isoDate, title: "Daily Log", content: encryptedText, media: encryptedImagesList, audio: encryptedAudioList, type: 'JOURNAL'
            }, { headers: { 'x-auth-token': userToken } });

            Alert.alert("✅ Saved", `Your entry from ${draft.date} has been uploaded.`);
            setStaleDraft(null);
            await AsyncStorage.multiRemove(['draft_journal_text', 'draft_journal_images', 'draft_journal_voice', 'draft_journal_date']);
            setShowSyncModal(false); setPasskeyInput(''); setModalMessage(null);
        } catch (e) { Alert.alert("Error", "Could not upload old draft."); }
        finally { setUploading(false); }
    };

    const switchMode = (newMode) => {
        if (newMode === entryType) return;
        setIsEditable(true);
        if (newMode === 'THOUGHT') {
            const currentJournalState = { text, images, voiceNotes };
            setJournalDraft(currentJournalState);
            saveDraftToStorage('JOURNAL', currentJournalState);
            setText(thoughtDraft.text);
            setImages(thoughtDraft.images);
            setVoiceNotes(thoughtDraft.voiceNotes);
            setThoughtTitle(thoughtDraft.title);
            setEntryType('THOUGHT');
        } else {
            const currentThoughtState = { text, images, voiceNotes, title: thoughtTitle };
            setThoughtDraft(currentThoughtState);
            saveDraftToStorage('THOUGHT', currentThoughtState);
            setText(journalDraft.text);
            setImages(journalDraft.images);
            setVoiceNotes(journalDraft.voiceNotes);
            setEntryType('JOURNAL');
        }
    };

    const saveDraftToStorage = async (type, data) => {
        try {
            const prefix = type === 'JOURNAL' ? 'draft_journal' : 'draft_thought';
            await AsyncStorage.setItem(`${prefix}_text`, data.text);
            await AsyncStorage.setItem(`${prefix}_images`, JSON.stringify(data.images));
            await AsyncStorage.setItem(`${prefix}_voice`, JSON.stringify(data.voiceNotes));
            await AsyncStorage.setItem(`${prefix}_date`, new Date().toDateString());
            if (type === 'THOUGHT') await AsyncStorage.setItem(`${prefix}_title`, data.title || '');
        } catch (e) { }
    };

    const handleManualSave = () => {
        if (entryType === 'JOURNAL') {
            const data = { text, images, voiceNotes };
            setJournalDraft(data);
            saveDraftToStorage('JOURNAL', data);
        } else {
            const data = { text, images, voiceNotes, title: thoughtTitle };
            setThoughtDraft(data);
            saveDraftToStorage('THOUGHT', data);
        }
        Alert.alert("Draft Saved", `Your ${entryType.toLowerCase()} is saved locally.`);
        Keyboard.dismiss();
        setIsEditable(false);
    };

    const handleSyncToCloud = async () => {
        // STRICT CHECK: Do we have the Master Key?
        if (journalKey) {
            performCloudUpload(journalKey);
        } else {
            // No Key? Force User to Unlock
            setModalMessage("Unlock Vault to Sync");
            setShowSyncModal(true);
        }
    };

    const performCloudUpload = async (keyToUse) => {
        if (!keyToUse) {
            Alert.alert("Security Error", "Cannot encrypt without verified key.");
            return;
        }

        if (!text.trim() && images.length === 0 && voiceNotes.length === 0) return;
        setUploading(true);

        if (entryType === 'JOURNAL') saveDraftToStorage('JOURNAL', { text, images, voiceNotes });
        else saveDraftToStorage('THOUGHT', { text, images, voiceNotes, title: thoughtTitle });

        try {
            const today = new Date().toISOString().split('T')[0];
            let finalTitle = "Daily Log";
            if (entryType === 'THOUGHT') {
                finalTitle = thoughtTitle.trim() || `Thought @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }

            const encryptedText = CryptoService.encrypt(text, keyToUse);

            let encryptedImagesList = [];
            for (const uri of images) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedImagesList.push(CryptoService.encrypt(base64, keyToUse));
            }
            let encryptedAudioList = [];
            for (const uri of voiceNotes) {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                encryptedAudioList.push(CryptoService.encrypt(base64, keyToUse));
            }

            await api.post('/entries', {
                date: today, title: finalTitle, content: encryptedText, media: encryptedImagesList, audio: encryptedAudioList, type: entryType
            }, { headers: { 'x-auth-token': userToken } });

            Alert.alert("✅ Secured", `${entryType === 'THOUGHT' ? "Thought" : "Journal"} uploaded!`);

            if (entryType === 'THOUGHT') {
                setText(''); setImages([]); setVoiceNotes([]); setThoughtTitle('');
                setThoughtDraft({ text: '', images: [], voiceNotes: [], title: '' });
                AsyncStorage.multiRemove(['draft_thought_text', 'draft_thought_images', 'draft_thought_voice', 'draft_thought_title', 'draft_thought_date']);
                setIsEditable(true);
            } else {
                setImages([]); setVoiceNotes([]);
                setJournalDraft(prev => ({ ...prev, images: [], voiceNotes: [] }));
                saveDraftToStorage('JOURNAL', { text, images: [], voiceNotes: [] });
                setIsEditable(false);
            }

            setShowSyncModal(false); setPasskeyInput('');
        } catch (error) {
            console.log("Upload Error:", error);
            Alert.alert("Error", "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleUnlockAndSync = async () => {
        // This now runs the CANARY check inside AuthContext
        // It returns the KEY if valid, or FALSE if invalid
        const verifiedKey = await unlockVault(passkeyInput);

        if (verifiedKey) {
            // ✅ We pass the VERIFIED key directly to upload
            performCloudUpload(verifiedKey);
        } else {
            // ❌ Canary check failed
            Alert.alert("⛔ Access Denied", "Wrong Passkey. Cannot Encrypt.");
        }
    };

    // ... Media Helpers (pickImage, startRecording, stopRecording) remain same ...
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

            <View style={styles.toggleContainer}>
                <TouchableOpacity style={[styles.toggleBtn, entryType === 'JOURNAL' && styles.toggleBtnActive]} onPress={() => switchMode('JOURNAL')}>
                    <Text style={[styles.toggleText, entryType === 'JOURNAL' && styles.toggleTextActive]}>📖 Daily Log</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, entryType === 'THOUGHT' && styles.toggleBtnActive]} onPress={() => switchMode('THOUGHT')}>
                    <Text style={[styles.toggleText, entryType === 'THOUGHT' && styles.toggleTextActive]}>💡 Thought</Text>
                </TouchableOpacity>
            </View>

            {entryType === 'THOUGHT' && (
                <TextInput
                    style={[styles.titleInput, !isEditable && styles.inputDisabled]}
                    placeholder="Title"
                    value={thoughtTitle}
                    onChangeText={setThoughtTitle}
                    editable={isEditable}
                />
            )}

            <View style={{ flex: 1 }}>
                <TextInput
                    style={[styles.editor, !isEditable && styles.inputDisabled]}
                    multiline
                    placeholder={entryType === 'JOURNAL' ? "How was your day?" : "What's on your mind?"}
                    value={text}
                    onChangeText={setText}
                    textAlignVertical="top"
                    editable={isEditable}
                />
                {!isEditable && (
                    <TouchableOpacity style={styles.unlockBtn} onPress={() => setIsEditable(true)}>
                        <Text style={{ fontSize: 20 }}>✏️</Text>
                    </TouchableOpacity>
                )}
            </View>

            {images.length > 0 && (
                <View style={{ height: 80, marginBottom: 10 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {images.map((uri, i) => <Image key={i} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 10 }} />)}
                    </ScrollView>
                </View>
            )}

            <View style={[styles.actionArea, !isEditable && { opacity: 1.0 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Button title="📸 Photo" onPress={pickImage} disabled={!isEditable} />
                    <Button title={recording ? "⏹ Stop" : "🎤 Voice"} onPress={recording ? stopRecording : startRecording} color={recording ? "red" : "blue"} disabled={!isEditable} />
                </View>
                {voiceNotes.length > 0 && <Text style={{ marginBottom: 10, color: 'green', textAlign: 'center' }}>{voiceNotes.length} Voice Note(s) recorded</Text>}

                <View style={styles.buttonRow}>
                    <Button title="Save Draft" onPress={handleManualSave} color="#666" />
                    <View style={{ width: 20 }} />
                    <Button title={uploading ? "Encrypting..." : `🔒 Sync ${entryType === 'THOUGHT' ? "Thought" : "Log"}`} onPress={handleSyncToCloud} disabled={uploading} color="#8a2be2" />
                </View>
            </View>

            {/* ⚠️ RESET BUTTON: ADDED HERE TO FIX YOUR CORRUPTED STATE */}
            {/* <TouchableOpacity
                onPress={async () => {
                    await AsyncStorage.clear();
                    await SecureStore.deleteItemAsync('user_passkey');
                    alert("App Wiped. Please Restart & Login to Fix Security.");
                }}
                style={{ marginTop: 10, padding: 10, backgroundColor: '#ffcccc', borderRadius: 5 }}
            >
                {/* <Text style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>⚠️ RESET & FIX APP</Text> */}
            {/* </TouchableOpacity> */} 

            {showSyncModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={{ marginBottom: 10, textAlign: 'center', fontWeight: 'bold' }}>{modalMessage || "Enter Passkey to Unlock Vault"}</Text>
                        <TextInput style={styles.modalInput} placeholder="Passkey" secureTextEntry value={passkeyInput} onChangeText={setPasskeyInput} />
                        <Button title="Unlock & Upload" onPress={handleUnlockAndSync} />
                        <TouchableOpacity onPress={() => { setShowSyncModal(false); setModalMessage(null); }}>
                            <Text style={{ color: 'red', textAlign: 'center', marginTop: 15 }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    date: { fontSize: 18, fontWeight: 'bold' },
    status: { fontSize: 12, color: 'blue', marginTop: 4 },
    logoutBtn: { backgroundColor: '#ffebee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ffcdd2', justifyContent: 'center' },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 4, marginBottom: 10 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    toggleBtnActive: { backgroundColor: 'white', shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2 },
    toggleText: { fontWeight: '600', color: '#666' },
    toggleTextActive: { color: '#000' },
    titleInput: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', fontWeight: 'bold' },
    editor: { flex: 1, backgroundColor: 'white', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    inputDisabled: { backgroundColor: '#e0e0e0', color: '#555' },
    unlockBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'white', padding: 8, borderRadius: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.2 },
    actionArea: { marginBottom: 10 },
    buttonRow: { flexDirection: 'row', justifyContent: 'center' },
    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 15, width: '80%', elevation: 5 },
    modalInput: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 5, marginBottom: 15 },
});