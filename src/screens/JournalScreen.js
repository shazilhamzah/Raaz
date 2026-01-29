import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, Button, Alert, Keyboard, TouchableOpacity, Image, ScrollView } from 'react-native';
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
        <View className="flex-1 p-5 pt-12 bg-primary">
            <View className="flex-row justify-between mb-6">
                <View>
                    <Text className="text-xl font-matanya text-white">{new Date().toDateString()}</Text>
                    <Text className="text-xs text-highlight mt-1">{journalKey ? "🔓 Vault Open" : "📱 Local Mode"}</Text>
                </View>
                <TouchableOpacity onPress={logout} className="bg-secondary px-4 py-2 rounded-full border border-accent/30 justify-center">
                    <Text className="text-sm text-highlight font-bold">🚪 Logout</Text>
                </TouchableOpacity>
            </View>

            <View className="flex-row bg-secondary/50 rounded-xl p-1 mb-5 border border-accent/20">
                <TouchableOpacity
                    className={`flex-1 py-3 items-center rounded-lg ${entryType === 'JOURNAL' ? 'bg-accent shadow-sm' : ''}`}
                    onPress={() => switchMode('JOURNAL')}
                >
                    <Text className={`font-bold ${entryType === 'JOURNAL' ? 'text-white' : 'text-highlight/50'}`}>📖 Daily Log</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-3 items-center rounded-lg ${entryType === 'THOUGHT' ? 'bg-accent shadow-sm' : ''}`}
                    onPress={() => switchMode('THOUGHT')}
                >
                    <Text className={`font-bold ${entryType === 'THOUGHT' ? 'text-white' : 'text-highlight/50'}`}>💡 Thought</Text>
                </TouchableOpacity>
            </View>

            {entryType === 'THOUGHT' && (
                <TextInput
                    className={`bg-secondary p-4 rounded-xl mb-4 text-lg border border-accent/30 font-bold text-white ${!isEditable ? 'opacity-50' : ''}`}
                    placeholder="Title"
                    placeholderTextColor="#BDE8F5"
                    value={thoughtTitle}
                    onChangeText={setThoughtTitle}
                    editable={isEditable}
                />
            )}

            <View className="flex-1">
                <TextInput
                    className={`flex-1 bg-secondary rounded-2xl p-5 text-base mb-4 border border-accent/30 text-white ${!isEditable ? 'opacity-70' : ''}`}
                    multiline
                    placeholder={entryType === 'JOURNAL' ? "How was your day?" : "What's on your mind?"}
                    placeholderTextColor="#BDE8F5"
                    value={text}
                    onChangeText={setText}
                    textAlignVertical="top"
                    editable={isEditable}
                />
                {!isEditable && (
                    <TouchableOpacity className="absolute top-2 right-2 bg-white p-2 rounded-full shadow-md" onPress={() => setIsEditable(true)}>
                        <Text className="text-xl">✏️</Text>
                    </TouchableOpacity>
                )}
            </View>

            {images.length > 0 && (
                <View className="h-20 mb-3">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {images.map((uri, i) => <Image key={i} source={{ uri }} className="w-20 h-20 rounded-lg mr-2" />)}
                    </ScrollView>
                </View>
            )}

            <View className={`mb-3 ${!isEditable ? 'opacity-100' : ''}`}>
                <View className="flex-row justify-between mb-4 space-x-2">
                    <TouchableOpacity
                        className="flex-1 bg-secondary p-3 rounded-xl border border-accent/50 items-center"
                        onPress={pickImage}
                        disabled={!isEditable}
                    >
                        <Text className="text-highlight font-bold">📸 Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`flex-1 p-3 rounded-xl border border-accent/50 items-center ${recording ? "bg-red-500/20 border-red-500" : "bg-secondary"}`}
                        onPress={recording ? stopRecording : startRecording}
                        disabled={!isEditable}
                    >
                        <Text className={`${recording ? "text-red-400" : "text-highlight"} font-bold`}>
                            {recording ? "⏹ Stop" : "🎤 Voice"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {voiceNotes.length > 0 && <Text className="mb-3 text-green-400 text-center text-xs font-bold">{voiceNotes.length} Voice Note(s) recorded</Text>}

                <View className="flex-row justify-center space-x-3">
                    <TouchableOpacity
                        className="flex-1 bg-secondary/50 p-4 rounded-2xl items-center border border-accent/20"
                        onPress={handleManualSave}
                    >
                        <Text className="text-gray-400 font-bold">Save Draft</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`flex-1 p-4 rounded-2xl items-center shadow-lg ${uploading ? 'bg-accent/50' : 'bg-accent'}`}
                        onPress={handleSyncToCloud}
                        disabled={uploading}
                    >
                        <Text className="text-primary font-bold uppercase tracking-wider">
                            {uploading ? "Encrypting..." : `🔒 Sync ${entryType === 'THOUGHT' ? "Thought" : "Log"}`}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ⚠️ RESET BUTTON: ADDED HERE TO FIX YOUR CORRUPTED STATE */}
            {/* <TouchableOpacity
                onPress={async () => {
                    await AsyncStorage.clear();
                    await SecureStore.deleteItemAsync('user_passkey');
                    alert("App Wiped. Please Restart & Login to Fix Security.");
                }}
                className="mt-2 p-2 bg-red-100 rounded-lg"
            >
                {/* <Text className="text-red-500 text-center font-bold">⚠️ RESET & FIX APP</Text> */}
            {/* </TouchableOpacity> */}

            {showSyncModal && (
                <View className="absolute inset-0 bg-primary/90 justify-center items-center">
                    <View className="bg-secondary p-6 rounded-2xl w-4/5 shadow-2xl border border-accent">
                        <Text className="mb-6 text-center font-bold text-white text-lg font-matanya">{modalMessage || "Unlock Vault"}</Text>
                        <TextInput
                            className="bg-primary border border-accent p-4 rounded-xl mb-6 text-white text-center text-lg tracking-widest"
                            placeholder="Passkey"
                            placeholderTextColor="#555"
                            secureTextEntry
                            value={passkeyInput}
                            onChangeText={setPasskeyInput}
                            keyboardType="numeric"
                        />
                        <TouchableOpacity
                            className="bg-accent p-4 rounded-xl items-center mb-3"
                            onPress={handleUnlockAndSync}
                        >
                            <Text className="text-primary font-bold text-lg">Unlock & Upload</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { setShowSyncModal(false); setModalMessage(null); }}>
                            <Text className="text-red-400 text-center mt-2 font-bold">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}
