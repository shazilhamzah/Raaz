import React, { useState, useEffect, useContext } from 'react';
import {
    View, Text, TextInput, Alert, Keyboard, TouchableOpacity, Image, ScrollView,
    ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; // Ensure legacy import if using older Expo
import { Audio } from 'expo-av';
import { AuthContext } from '../context/AuthContext';

import api from '../services/api';
import CryptoService from '../services/CryptoService';

export default function JournalScreen() {
    const { userToken, journalKey, unlockVault, unlockWithBiometrics, logout, userEmail } = useContext(AuthContext);

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
    const [loadingCloud, setLoadingCloud] = useState(false); // <--- NEW LOADING STATE

    // --- HELPER: TIMEZONE FIX ---
    const toLocalISOString = (dateInput) => {
        const date = new Date(dateInput);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStorageKey = (keyName) => {
        if (!userEmail) return null;
        return `${keyName}_${userEmail}`;
    };

    useEffect(() => {
        if (userEmail) loadInitialDraft();
    }, [userEmail]);

    useEffect(() => {
        if (journalKey && staleDraft) {
            uploadStaleDraft(journalKey, staleDraft);
        }
    }, [journalKey, staleDraft]);

    const loadInitialDraft = async () => {
        try {
            const todayStr = new Date().toDateString();
            const jText = await AsyncStorage.getItem(getStorageKey('draft_journal_text'));
            const jImages = await AsyncStorage.getItem(getStorageKey('draft_journal_images'));
            const jVoice = await AsyncStorage.getItem(getStorageKey('draft_journal_voice'));
            const jDate = await AsyncStorage.getItem(getStorageKey('draft_journal_date'));

            const parsedJImages = jImages ? JSON.parse(jImages) : [];
            const parsedJVoice = jVoice ? JSON.parse(jVoice) : [];

            const hasContent = (jText && jText.trim().length > 0) || parsedJImages.length > 0 || parsedJVoice.length > 0;

            if (jDate && jDate !== todayStr && hasContent) {
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
                setIsEditable(!hasContent);
            }
        } catch (e) { console.log("Load Error", e); }
    };

    const processStaleDraft = async (draft) => {
        const verifiedKey = await unlockWithBiometrics();
        if (verifiedKey && typeof verifiedKey === 'string') {
            Alert.alert("🔄 Auto-Sync", `Uploading unsent entry from ${draft.date}...`);
        } else {
            setModalMessage(`Found unsent entry from ${draft.date}. Enter Passkey to save it.`);
            setShowSyncModal(true);
        }
    };

    // --- NEW: LOAD FROM CLOUD FEATURE ---
    // --- NEW: LOAD TEXT FROM CLOUD ---
    const handleLoadFromCloud = async () => {
        if (entryType !== 'JOURNAL') {
            Alert.alert("Notice", "You can only load Daily Logs, not Thoughts.");
            return;
        }
        if (!journalKey) {
            setModalMessage("Unlock Vault to Load");
            setShowSyncModal(true);
            return;
        }

        Alert.alert(
            "Load Text?",
            "This will overwrite your current text with the version on the cloud.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Load & Overwrite",
                    style: "destructive",
                    onPress: () => performCloudFetch()
                }
            ]
        );
    };

    const performCloudFetch = async () => {
        setLoadingCloud(true);
        try {
            // 1. Calculate Today's Date in Local Time
            const todayISO = toLocalISOString(new Date());
            console.log("Fetching for:", todayISO);

            // 2. Fetch Entry
            const res = await api.get(`/entries/date/${todayISO}`, { headers: { 'x-auth-token': userToken } });
            const entry = res.data;

            if (!entry) {
                Alert.alert("No Entry", "No cloud entry found for today.");
                setLoadingCloud(false);
                return;
            }

            // 3. Decrypt Text Only
            try {
                let decryptedText = "";

                // CHECK: Only try decrypting if there is actually content
                if (entry.content && entry.content.trim().length > 0) {
                    const result = CryptoService.decrypt(entry.content, journalKey);

                    // Handle legacy object wrapper if it exists
                    if (typeof result === 'object' && result !== null && 'text' in result) {
                        decryptedText = result.text;
                    } else {
                        decryptedText = result || "";
                    }
                }

                // 4. Update State
                setText(decryptedText);

                // 5. Update Local Draft Storage
                // (We pass empty arrays for media to preserve existing local media if any, or you can clear them)
                const newData = { text: decryptedText, images, voiceNotes, videos };
                setJournalDraft(newData);
                saveDraftToStorage('JOURNAL', newData);

                setIsEditable(false); // Lock it to prevent accidental overwrites immediately
                Alert.alert("Success", "Cloud text loaded.");

            } catch (decryptError) {
                // console.log("Decryption Failed:", decryptError);
                // Alert.alert(
                //     "Decryption Failed",
                //     "Could not unlock this entry. \n\nIf you are on a new device, your encryption key might be different than the one that saved this entry."
                // );
            }

        } catch (error) {
            console.log("Network Error:", error);
            if (error.response && error.response.status === 404) {
                Alert.alert("Empty", "No entry uploaded for today yet.");
            } else {
                Alert.alert("Error", "Failed to load from cloud.");
            }
        } finally {
            setLoadingCloud(false);
        }
    };
    // Helper: Downloads encrypted file, decrypts to Base64, saves as temp file
    const downloadAndCacheMedia = async (filename, key, extension) => {
        try {
            // Fetch encrypted string/blob
            const res = await api.get(`/entries/media/${filename}`, {
                headers: { 'x-auth-token': userToken },
                responseType: 'text'
            });

            // Decrypt to get Base64 string
            const decryptedData = CryptoService.decrypt(res.data, key);
            let base64Str = decryptedData;
            if (typeof decryptedData === 'object' && decryptedData !== null && 'text' in decryptedData) {
                base64Str = decryptedData.text;
            }

            // Save to Cache
            const fileUri = FileSystem.cacheDirectory + `restored_${filename}.${extension}`;
            await FileSystem.writeAsStringAsync(fileUri, base64Str, { encoding: 'base64' });

            return fileUri;
        } catch (e) {
            console.log(`Failed to restore media: ${filename}`, e);
            return null;
        }
    };

    const convertUriToBase64 = async (uri) => {
        if (Platform.OS === 'web') {
            try {
                const response = await fetch(uri);
                const blob = await response.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) { return ""; }
        } else {
            return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        }
    };

    const uploadStaleDraft = async (key, draft) => {
        if (uploading) return;
        setUploading(true);
        try {
            const encryptedText = CryptoService.encrypt(draft.text || '', key);

            let encryptedImagesList = [];
            for (const uri of draft.images) {
                const base64 = await convertUriToBase64(uri);
                encryptedImagesList.push(CryptoService.encrypt(base64, key));
            }

            let encryptedAudioList = [];
            for (const uri of draft.voiceNotes) {
                const base64 = await convertUriToBase64(uri);
                encryptedAudioList.push(CryptoService.encrypt(base64, key));
            }

            const isoDate = toLocalISOString(draft.date);

            await api.post('/entries', {
                date: isoDate,
                title: "Daily Log",
                content: encryptedText,
                media: encryptedImagesList,
                audio: encryptedAudioList,
                type: 'JOURNAL'
            }, { headers: { 'x-auth-token': userToken } });

            Alert.alert("✅ Saved", `Your entry from ${draft.date} has been uploaded.`);
            setStaleDraft(null);

            const keysToRemove = [
                getStorageKey('draft_journal_text'),
                getStorageKey('draft_journal_images'),
                getStorageKey('draft_journal_voice'),
                getStorageKey('draft_journal_date')
            ];
            await AsyncStorage.multiRemove(keysToRemove);

            setShowSyncModal(false); setPasskeyInput(''); setModalMessage(null);
        } catch (e) { Alert.alert("Error", "Could not upload old draft."); }
        finally { setUploading(false); }
    };

    const switchMode = (newMode) => {
        if (newMode === entryType) return;
        requestAnimationFrame(() => {
            if (newMode === 'THOUGHT') {
                const currentJournalState = { text, images, voiceNotes };
                setJournalDraft(currentJournalState);
                saveDraftToStorage('JOURNAL', currentJournalState);

                setText(thoughtDraft.text);
                setImages(thoughtDraft.images);
                setVoiceNotes(thoughtDraft.voiceNotes);
                setThoughtTitle(thoughtDraft.title);
                setIsEditable(true);
                setEntryType('THOUGHT');
            } else {
                const currentThoughtState = { text, images, voiceNotes, title: thoughtTitle };
                setThoughtDraft(currentThoughtState);
                saveDraftToStorage('THOUGHT', currentThoughtState);

                setText(journalDraft.text);
                setImages(journalDraft.images);
                setVoiceNotes(journalDraft.voiceNotes);

                const hasContent = (journalDraft.text && journalDraft.text.trim().length > 0) ||
                    journalDraft.images.length > 0 ||
                    journalDraft.voiceNotes.length > 0;

                setIsEditable(!hasContent);
                setEntryType('JOURNAL');
            }
        });
    };

    const saveDraftToStorage = async (type, data) => {
        try {
            const prefix = type === 'JOURNAL' ? 'draft_journal' : 'draft_thought';
            await AsyncStorage.setItem(getStorageKey(`${prefix}_text`), data.text);
            await AsyncStorage.setItem(getStorageKey(`${prefix}_images`), JSON.stringify(data.images));
            await AsyncStorage.setItem(getStorageKey(`${prefix}_voice`), JSON.stringify(data.voiceNotes));
            await AsyncStorage.setItem(getStorageKey(`${prefix}_date`), new Date().toDateString());
            if (type === 'THOUGHT') await AsyncStorage.setItem(getStorageKey(`${prefix}_title`), data.title || '');
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
        if (Platform.OS !== 'web') Keyboard.dismiss();
        setIsEditable(false);
    };

    const handleSyncToCloud = async () => {
        if (journalKey) {
            performCloudUpload(journalKey);
        } else {
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

        const currentData = { text, images, voiceNotes, ...(entryType === 'THOUGHT' && { title: thoughtTitle }) };
        saveDraftToStorage(entryType, currentData);

        try {
            const today = toLocalISOString(new Date());
            let finalTitle = "Daily Log";
            if (entryType === 'THOUGHT') {
                finalTitle = thoughtTitle.trim() || `Thought @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }

            const encryptedText = CryptoService.encrypt(text, keyToUse);

            let encryptedImagesList = [];
            for (const uri of images) {
                const base64 = await convertUriToBase64(uri);
                encryptedImagesList.push(CryptoService.encrypt(base64, keyToUse));
            }
            let encryptedAudioList = [];
            for (const uri of voiceNotes) {
                const base64 = await convertUriToBase64(uri);
                encryptedAudioList.push(CryptoService.encrypt(base64, keyToUse));
            }

            await api.post('/entries', {
                date: today,
                title: finalTitle,
                content: encryptedText,
                media: encryptedImagesList,
                audio: encryptedAudioList,
                type: entryType
            }, { headers: { 'x-auth-token': userToken } });

            Alert.alert("✅ Secured", `${entryType === 'THOUGHT' ? "Thought" : "Journal"} uploaded!`);
            if (entryType == 'THOUGHT') {
                setText('');
            }
            setImages([]); setVoiceNotes([]);
            if (entryType === 'THOUGHT') {
                setThoughtTitle('');
                setThoughtDraft({ text: '', images: [], voiceNotes: [], title: '' });
                const tKeys = [
                    getStorageKey('draft_thought_text'), getStorageKey('draft_thought_images'),
                    getStorageKey('draft_thought_voice'),
                    getStorageKey('draft_thought_title'), getStorageKey('draft_thought_date')
                ];
                AsyncStorage.multiRemove(tKeys);
            } else {
                // setJournalDraft(prev => ({ ...prev, images: [], voiceNotes: [] }));
                saveDraftToStorage('JOURNAL', { text, images: [], voiceNotes: [] });
            }
            setIsEditable(false);
            setShowSyncModal(false); setPasskeyInput('');
        } catch (error) {
            Alert.alert("Error", "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleUnlockAndSync = async () => {
        const verifiedKey = await unlockVault(passkeyInput);
        if (verifiedKey) {
            // Check if we are loading or syncing
            if (modalMessage?.includes("Load Cloud")) {
                performCloudFetch(); // Reuse the key for fetching
            } else {
                performCloudUpload(verifiedKey);
            }
        } else {
            Alert.alert("⛔ Access Denied", "Wrong Passkey.");
        }
    };

    const handleImagePress = () => {
        Alert.alert(
            "Add Photo",
            "Choose an option",
            [
                { text: "Camera", onPress: () => captureImage() },
                { text: "Gallery", onPress: () => pickImage() },
                { text: "Cancel", style: "cancel" }
            ]
        );
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.5 });
        if (!result.canceled) setImages([...images, result.assets[0].uri]);
    };

    const captureImage = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.5 });
        if (!result.canceled) setImages([...images, result.assets[0].uri]);
    };

    const startRecording = async () => {
        if (Platform.OS === 'web') return Alert.alert("Not Supported", "Voice recording is not currently supported on Web.");
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

    // --- RENDER ---
    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            className="bg-primary"
            keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        >
            <View className="flex-1 pt-12 px-6">

                {/* ... HEADER ... */}
                <View className="flex-row justify-between items-center mb-8">
                    <View>
                        <Text className="text-3xl mt-2 text-highlight font-matanya tracking-widest uppercase">
                            {new Date().toDateString()}
                        </Text>
                        <View className="flex-row items-center mt-2">
                            <Ionicons
                                name={entryType === 'JOURNAL' ? "book-outline" : "bulb-outline"}
                                size={20}
                                color="#fff"
                                style={{ marginRight: 8, opacity: 0.8 }}
                            />
                            <Text className="text-accent/80 text-lg font-semibold tracking-wider uppercase">
                                {entryType === 'JOURNAL' ? "Daily Log" : "Deep Thought"}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={logout} className="bg-secondary/40 p-3 rounded-full border border-accent/20">
                        <Ionicons name="log-out-outline" size={24} color="#BDE8F5" />
                    </TouchableOpacity>
                </View>

                {/* ... SEGMENTED CONTROL ... */}
                <View style={styles.segmentContainer}>
                    <TouchableOpacity
                        style={[styles.segmentButton, entryType === 'JOURNAL' && styles.segmentButtonActive]}
                        onPress={() => switchMode('JOURNAL')}
                    >
                        <Ionicons name="book-outline" size={16} color={entryType === 'JOURNAL' ? "#BDE8F5" : "rgba(189, 232, 245, 0.5)"} />
                        <Text style={[styles.segmentText, entryType === 'JOURNAL' && styles.segmentTextActive]}>JOURNAL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.segmentButton, entryType === 'THOUGHT' && styles.segmentButtonActive]}
                        onPress={() => switchMode('THOUGHT')}
                    >
                        <Ionicons name="bulb-outline" size={16} color={entryType === 'THOUGHT' ? "#BDE8F5" : "rgba(189, 232, 245, 0.5)"} />
                        <Text style={[styles.segmentText, entryType === 'THOUGHT' && styles.segmentTextActive]}>THOUGHT</Text>
                    </TouchableOpacity>
                </View>

                {/* ... SCROLLABLE CONTENT AREA ... */}
                <View className="flex-1 bg-secondary/20 rounded-3xl border border-accent/10 mb-4 overflow-hidden">
                    <ScrollView
                        className="flex-1"
                        showsVerticalScrollIndicator={false}
                        keyboardDismissMode="on-drag"
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 150 }}
                    >
                        {entryType === 'THOUGHT' && (
                            <TextInput
                                style={{
                                    fontSize: 26, color: 'white', marginBottom: 20, borderBottomWidth: 1,
                                    borderBottomColor: 'rgba(189, 232, 245, 0.3)', paddingBottom: 12, fontWeight: '600', letterSpacing: 0.5
                                }}
                                placeholder="Title your thought..."
                                placeholderTextColor="rgba(189, 232, 245, 0.25)"
                                value={thoughtTitle}
                                onChangeText={setThoughtTitle}
                                editable={isEditable}
                                allowFontScaling={false}
                            />
                        )}

                        <TextInput
                            style={{ fontSize: 17, color: 'rgba(255, 255, 255, 0.92)', lineHeight: 28, minHeight: 100, textAlignVertical: "top" }}
                            multiline
                            placeholder={entryType === 'JOURNAL' ? "Write about your day..." : "What's on your mind?"}
                            placeholderTextColor="rgba(189, 232, 245, 0.25)"
                            value={text}
                            onChangeText={setText}
                            editable={isEditable}
                            scrollEnabled={false}
                            allowFontScaling={false}
                            keyboardAppearance="dark"
                        />
                    </ScrollView>

                    {!isEditable && (
                        <TouchableOpacity
                            className="absolute bottom-4 right-4 bg-accent p-4 rounded-full shadow-lg shadow-black/40 z-10"
                            onPress={() => setIsEditable(true)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="pencil" size={24} color="#0F2854" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ... MEDIA PREVIEW CAROUSEL ... */}
                {images.length > 0 && (
                    <View className="h-28 mb-3">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20, paddingLeft: 4 }}>
                            {images.map((uri, i) => (
                                <View key={i} className="relative mr-4">
                                    <Image source={{ uri }} className="w-24 h-24 rounded-2xl border border-accent/30" />
                                    <TouchableOpacity
                                        className="absolute -top-3 -right-3 bg-red-500 rounded-full p-1.5 border-2 border-primary z-10 shadow-sm"
                                        onPress={() => { const newImages = [...images]; newImages.splice(i, 1); setImages(newImages); }}
                                        disabled={!isEditable}
                                    >
                                        <Ionicons name="close" size={12} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ... VOICE NOTES PREVIEW ... */}
                {voiceNotes.length > 0 && (
                    <View className="mb-4">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20, paddingLeft: 4 }}>
                            {voiceNotes.map((uri, i) => (
                                <View key={i} className="relative mr-3">
                                    <View className="bg-secondary/50 border border-accent/30 rounded-2xl px-4 py-3 flex-row items-center">
                                        <View className="bg-accent/20 p-2 rounded-full mr-3">
                                            <Ionicons name="mic" size={20} color="#BDE8F5" />
                                        </View>
                                        <Text className="text-highlight font-semibold">Voice {i + 1}</Text>
                                    </View>
                                    <TouchableOpacity
                                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1.5 border-2 border-primary z-10 shadow-sm"
                                        onPress={() => { const newVoiceNotes = [...voiceNotes]; newVoiceNotes.splice(i, 1); setVoiceNotes(newVoiceNotes); }}
                                        disabled={!isEditable}
                                    >
                                        <Ionicons name="close" size={12} color="white" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ... UNIFIED ACTION GRID (Updated with LOAD button) ... */}
                {/* ... UNIFIED ACTION GRID ... */}
                <View className={`mb-6 flex-row flex-wrap gap-3 justify-between ${!isEditable ? 'opacity-100' : ''}`}>

                    {/* Row 1: Media Buttons */}
                    <TouchableOpacity
                        className="w-[30%] bg-secondary/50 py-3 rounded-2xl items-center justify-center border border-accent/20 active:bg-secondary"
                        onPress={handleImagePress}
                        disabled={!isEditable}
                    >
                        <Ionicons name="image-outline" size={22} color={!isEditable ? "#4988C4" : "#BDE8F5"} />
                        <Text className={`text-[10px] font-bold mt-1 uppercase ${!isEditable ? "text-accent/50" : "text-highlight"}`}>Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`w-[30%] py-3 rounded-2xl items-center justify-center border active:bg-secondary ${recording ? "bg-red-500/10 border-red-500/50" : "bg-secondary/50 border-accent/20"}`}
                        onPress={recording ? stopRecording : startRecording}
                        disabled={!isEditable}
                    >
                        <Ionicons name={recording ? "stop" : "mic-outline"} size={22} color={recording ? "#FF6B6B" : (!isEditable ? "#4988C4" : "#BDE8F5")} />
                        <Text className={`text-[10px] font-bold mt-1 uppercase ${recording ? "text-red-400" : (!isEditable ? "text-accent/50" : "text-highlight")}`}>{recording ? "Stop" : "Voice"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="w-[30%] bg-secondary/50 py-3 rounded-2xl items-center justify-center border border-accent/20 active:bg-secondary"
                        onPress={handleManualSave}
                    >
                        <Ionicons name="save-outline" size={22} color="#BDE8F5" />
                        <Text className="text-highlight text-[10px] font-bold mt-1 uppercase">Draft</Text>
                    </TouchableOpacity>

                    {/* Row 2: Cloud Actions */}
                    <TouchableOpacity
                        className="w-[48%] bg-accent/20 py-3 rounded-2xl items-center justify-center border border-accent/40 active:bg-secondary mt-1"
                        onPress={handleLoadFromCloud}
                        disabled={loadingCloud}
                    >
                        {loadingCloud ? (<ActivityIndicator size="small" color="#BDE8F5" />) : (
                            <>
                                <Ionicons name="cloud-download-outline" size={22} color="#BDE8F5" />
                                <Text className="text-highlight text-[10px] font-bold mt-1 uppercase">Load Text</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`w-[48%] py-3 rounded-2xl items-center justify-center border active:opacity-90 shadow-sm mt-1 ${uploading ? 'bg-accent/50 border-accent/50' : 'bg-accent border-accent'}`}
                        onPress={handleSyncToCloud}
                        disabled={uploading}
                    >
                        {uploading ? (<ActivityIndicator size="small" color="#0F2854" />) : (
                            <>
                                <Ionicons name="lock-closed" size={22} color="#0F2854" />
                                <Text className="text-primary text-[10px] font-bold mt-1 uppercase">Sync</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* ... MODAL ... */}
                {showSyncModal && (
                    <View className="absolute inset-0 bg-primary/95 justify-center items-center px-6">
                        <View className="w-full bg-secondary p-8 rounded-3xl border border-accent/30 shadow-2xl">
                            <View className="items-center mb-6">
                                <View className="bg-accent/20 p-4 rounded-full mb-4">
                                    <Ionicons name="shield-checkmark" size={48} color="#BDE8F5" />
                                </View>
                                <Text className="font-matanya text-3xl text-white text-center">{modalMessage || "Unlock Vault"}</Text>
                                <Text className="text-accent text-center mt-2">Enter your passkey to encrypt/decrypt.</Text>
                            </View>

                            <TextInput
                                className="bg-primary/50 border border-accent/50 p-5 rounded-2xl mb-8 text-white text-center text-2xl tracking-[5px] font-bold"
                                placeholder="Unlock"
                                placeholderTextColor="rgba(189, 232, 245, 0.2)"
                                secureTextEntry
                                value={passkeyInput}
                                onChangeText={setPasskeyInput}
                                keyboardType="default"
                                autoFocus
                            />

                            <TouchableOpacity
                                className="bg-accent py-4 rounded-2xl items-center mb-4 shadow-lg shadow-black/20"
                                onPress={handleUnlockAndSync}
                            >
                                <Text className="text-primary font-bold text-lg tracking-wider">CONFIRM</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => { setShowSyncModal(false); setModalMessage(null); }} className="py-2">
                                <Text className="text-red-400 text-center font-bold tracking-wide">CANCEL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </KeyboardAvoidingView >
    );
}

const styles = StyleSheet.create({
    segmentContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(28, 77, 141, 0.3)', // secondary/30
        padding: 4,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(73, 136, 196, 0.2)', // accent/20
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    segmentButtonActive: {
        backgroundColor: '#1C4D8D', // secondary
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
        elevation: 1,
    },
    segmentText: {
        fontWeight: 'bold',
        letterSpacing: 0.5,
        color: 'rgba(73, 136, 196, 0.5)', // accent/50
    },
    segmentTextActive: {
        color: '#BDE8F5', // highlight
    },
});