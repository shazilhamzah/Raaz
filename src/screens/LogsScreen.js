import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput, Image, Alert,
    Modal, Dimensions, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import CryptoService from '../services/CryptoService';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// 1️⃣ GLOBAL CACHE (Lives outside the component so it persists while App is running)
// Format: { 'filename.jpg': 'base64string...', 'voice.m4a': 'uri...' }
const MEDIA_CACHE = new Map();

export default function LogsScreen() {
    const {
        userToken, journalKey, unlockVault, unlockWithBiometrics,
        hasSavedPasskey, getRawKey
    } = useContext(AuthContext);

    const [passkeyInput, setPasskeyInput] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedId, setExpandedId] = useState(null); // Only one open at a time
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredEntries, setFilteredEntries] = useState([]);

    const [tempKey, setTempKey] = useState(null);
    const [fullscreenImage, setFullscreenImage] = useState(null);

    const activeKey = journalKey || tempKey;

    useEffect(() => { fetchLogs(); }, []);

    useEffect(() => {
        if (!activeKey) attemptBiometric();
    }, [activeKey]);

    const attemptBiometric = async () => {
        await unlockWithBiometrics();
    };

    const handleManualUnlock = async () => {
        const verifiedKey = await unlockVault(passkeyInput);
        if (verifiedKey) {
            setTempKey(null);
            setPasskeyInput('');
        } else {
            const rawKey = getRawKey(passkeyInput);
            setTempKey(rawKey);
            setPasskeyInput('');
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await api.get('/entries', { headers: { 'x-auth-token': userToken } });
            const sorted = res.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setEntries(sorted);
            setFilteredEntries(sorted);
        } catch (error) {
            console.log("Error fetching logs", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchLogs();
    };

    const handleSearch = (text) => {
        setSearchQuery(text);
        if (!text.trim()) { setFilteredEntries(entries); return; }
        const lowerText = text.toLowerCase();
        const filtered = entries.filter(item => {
            if (item.date.includes(lowerText)) return true;
            if (item.title && item.title.toLowerCase().includes(lowerText)) return true;
            return false;
        });
        setFilteredEntries(filtered);
    };

    // --- OPTIMIZED MEDIA VIEWER ---
    const MediaViewer = ({ filename }) => {
        const [imageUrl, setImageUrl] = useState(null);
        const [loadingImg, setLoadingImg] = useState(true);
        const isMounted = useRef(true); // Track mount state

        useEffect(() => {
            isMounted.current = true;

            // 2️⃣ CHECK CACHE FIRST
            if (MEDIA_CACHE.has(filename)) {
                setImageUrl(MEDIA_CACHE.get(filename));
                setLoadingImg(false);
            } else {
                loadMedia();
            }

            return () => { isMounted.current = false; }; // Cleanup
        }, []);

        const loadMedia = async () => {
            try {
                // Fetch encrypted data
                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken } });

                // 3️⃣ Decrypt (Heavy Calculation)
                // We use setTimeout to push this to the next tick, allowing UI to render the expanded view first
                setTimeout(() => {
                    if (!isMounted.current) return;

                    const decryptedBase64 = CryptoService.decrypt(res.data, activeKey);
                    const base64Str = (typeof decryptedBase64 === 'object' && decryptedBase64.text)
                        ? decryptedBase64.text
                        : decryptedBase64;

                    const finalUri = `data:image/jpeg;base64,${base64Str}`;

                    // SAVE TO CACHE
                    MEDIA_CACHE.set(filename, finalUri);

                    if (isMounted.current) {
                        setImageUrl(finalUri);
                        setLoadingImg(false);
                    }
                }, 10);

            } catch (e) {
                console.log("Image Load Fail");
                if (isMounted.current) setLoadingImg(false);
            }
        };

        if (loadingImg) return <ActivityIndicator color="#BDE8F5" size="small" style={{ marginTop: 10 }} />;

        return (
            <TouchableOpacity onPress={() => setFullscreenImage(imageUrl)} activeOpacity={0.8}>
                <Image source={{ uri: imageUrl }} className="w-full h-52 rounded-lg mt-3 bg-gray-700 resize-cover" />
            </TouchableOpacity>
        );
    };

    // --- OPTIMIZED AUDIO PLAYER ---
    const AudioPlayer = ({ filename }) => {
        const [sound, setSound] = useState();
        const [isPlaying, setIsPlaying] = useState(false);
        const [loadingAudio, setLoadingAudio] = useState(false);
        const isMounted = useRef(true);

        useEffect(() => {
            isMounted.current = true;
            return () => {
                isMounted.current = false;
                if (sound) sound.unloadAsync();
            };
        }, [sound]);

        const playSound = async () => {
            if (sound) {
                await sound.playAsync();
                setIsPlaying(true);
                return;
            }

            setLoadingAudio(true);

            try {
                let uri;

                // 2️⃣ CHECK CACHE (We store local file URI for audio)
                if (MEDIA_CACHE.has(filename)) {
                    uri = MEDIA_CACHE.get(filename);
                } else {
                    // Fetch & Decrypt
                    const res = await api.get(`/entries/media/${filename}`, {
                        headers: { 'x-auth-token': userToken },
                        responseType: 'text'
                    });

                    const cleanData = typeof res.data === 'string' ? res.data.trim() : res.data;
                    const result = CryptoService.decrypt(cleanData, activeKey);
                    const base64Audio = (typeof result === 'object' && result.text) ? result.text : result;

                    // Save to device storage
                    uri = FileSystem.cacheDirectory + filename + '.m4a';
                    await FileSystem.writeAsStringAsync(uri, base64Audio, { encoding: 'base64' });

                    // UPDATE CACHE
                    MEDIA_CACHE.set(filename, uri);
                }

                if (!isMounted.current) return;

                // Load & Play
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true }
                );

                setSound(newSound);
                setIsPlaying(true);

                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish && isMounted.current) setIsPlaying(false);
                });

            } catch (e) {
                Alert.alert("Playback Error", "Could not decrypt audio.");
            } finally {
                if (isMounted.current) setLoadingAudio(false);
            }
        };

        return (
            <TouchableOpacity onPress={playSound} className="flex-row items-center bg-accent/20 border border-accent/50 p-3 rounded-xl mt-3 w-full">
                {loadingAudio ? (
                    <ActivityIndicator color="#BDE8F5" size="small" />
                ) : (
                    <>
                        <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
                        <Text className="text-highlight font-bold">
                            {isPlaying ? "Playing Voice Note..." : "Play Voice Note"}
                        </Text>
                    </>
                )}
            </TouchableOpacity>
        );
    };

    // --- RENDER LIST ITEM ---
    const renderItem = ({ item }) => {
        const isExpanded = expandedId === item._id;
        let decryptedContent = '';

        // Only decrypt text if expanded
        if (isExpanded && activeKey) {
            const result = CryptoService.decrypt(item.content, activeKey);
            decryptedContent = (typeof result === 'object' && result.text) ? result.text : result;
        }

        const isThought = item.type === 'THOUGHT';
        const cardClass = isThought
            ? "bg-secondary/30 border-l-4 border-yellow-500/70"
            : "bg-secondary/20 border-l-4 border-accent";

        return (
            <TouchableOpacity
                className={`${cardClass} rounded-2xl mb-4 p-5 border border-accent/10 shadow-sm`}
                onPress={() => setExpandedId(isExpanded ? null : item._id)}
                activeOpacity={0.8}
            >
                <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                        <View className={`p-2 rounded-full mr-4 ${isThought ? "bg-yellow-500/20" : "bg-accent/20"}`}>
                            <Ionicons name={isThought ? "bulb-outline" : "book-outline"} size={24} color={isThought ? "#FCD34D" : "#BDE8F5"} />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-white text-lg font-matanya tracking-wide">{item.title || "Untitled"}</Text>
                            <Text className="text-accent/60 text-xs mt-1 font-semibold uppercase tracking-wider">{item.date}</Text>
                        </View>
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="rgba(189, 232, 245, 0.5)" />
                </View>

                {isExpanded && (
                    <View className="mt-4 pt-4 border-t border-accent/10">
                        <Text className="text-base leading-7 text-gray-200 mb-4 font-light">
                            {(typeof decryptedContent === 'string' ? decryptedContent : '') || <Text className="italic text-gray-500">(Empty content)</Text>}
                        </Text>

                        {/* Images */}
                        {item.media && item.media.map((f, i) => (
                            <MediaViewer key={`img_${i}`} filename={f} />
                        ))}

                        {/* Audio */}
                        {item.audio && item.audio.map((f, i) => (
                            <AudioPlayer key={`aud_${i}`} filename={f} />
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // --- LOCK SCREEN (Keep existing lock screen code...) ---
    if (!activeKey) {
        return (
            <View className="flex-1 justify-center items-center p-8 bg-primary">
                {/* ... (Your existing lock screen JSX) ... */}
                <View className="bg-accent/10 p-6 rounded-full mb-6 border border-accent/30">
                    <Ionicons name="lock-closed" size={64} color="#BDE8F5" />
                </View>
                <Text className="text-4xl font-matanya text-highlight mb-4 text-center tracking-widest">Vault Locked</Text>
                <TouchableOpacity
                    className={`flex-row p-5 rounded-2xl w-full items-center justify-center mb-6 shadow-lg shadow-black/40 border border-accent/20 ${hasSavedPasskey ? 'bg-accent' : 'bg-gray-700 opacity-50'}`}
                    onPress={attemptBiometric} disabled={!hasSavedPasskey}
                >
                    <Ionicons name="finger-print" size={24} color="#0F2854" style={{ marginRight: 10 }} />
                    <Text className="text-primary font-bold text-lg uppercase tracking-wider">
                        {hasSavedPasskey ? "Biometric Unlock" : "No Biometrics"}
                    </Text>
                </TouchableOpacity>

                <TextInput
                    className="w-full border border-accent/50 p-5 rounded-2xl mb-6 bg-secondary text-white text-center text-2xl tracking-[5px] font-bold placeholder:text-highlight/20"
                    placeholder="••••"
                    placeholderTextColor="#B0C4DE"
                    secureTextEntry
                    keyboardType="numeric"
                    value={passkeyInput}
                    onChangeText={setPasskeyInput}
                    maxLength={6}
                />

                <TouchableOpacity
                    className="bg-secondary/50 border border-accent/50 p-4 rounded-xl w-full items-center active:bg-secondary"
                    onPress={handleManualUnlock}
                >
                    <Text className="text-highlight font-bold tracking-wider">UNLOCK VAULT</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // --- MAIN LIST (Keep existing main list code...) ---
    return (
        <View className="flex-1 bg-primary pt-12 px-5">
            <View className="flex-row justify-between items-center mb-6">
                <View>
                    <Text className="text-3xl font-matanya text-highlight tracking-widest uppercase">Past Entries</Text>
                    {tempKey && <Text className="text-xs text-red-400 font-bold mt-1 tracking-wide uppercase">⚠️ Preview Mode</Text>}
                </View>
                <TouchableOpacity onPress={handleRefresh} className="bg-secondary/40 p-3 rounded-full border border-accent/20">
                    <Ionicons name="refresh" size={20} color="#BDE8F5" />
                </TouchableOpacity>
            </View>

            <View className="flex-row items-center bg-secondary/30 border border-accent/20 rounded-2xl px-4 mb-6">
                <Ionicons name="search" size={20} color="rgba(189, 232, 245, 0.5)" />
                <TextInput
                    className="flex-1 p-4 text-white font-semibold text-base"
                    placeholder="Search logs..."
                    placeholderTextColor="rgba(189, 232, 245, 0.3)"
                    value={searchQuery}
                    onChangeText={handleSearch}
                />
            </View>

            {loading ? (
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color="#4988C4" />
                </View>
            ) : (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center mt-20 opacity-50">
                            <Ionicons name="file-tray-open-outline" size={64} color="#4988C4" />
                            <Text className="text-center mt-4 text-accent text-lg">No entries found.</Text>
                        </View>
                    }
                />
            )}

            {/* FULLSCREEN IMAGE MODAL */}
            <Modal visible={fullscreenImage !== null} transparent={true} animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
                <TouchableWithoutFeedback onPress={() => setFullscreenImage(null)}>
                    <View className="flex-1 bg-black/95 justify-center items-center">
                        <TouchableOpacity className="absolute top-12 right-6 z-10 bg-white/20 p-3 rounded-full" onPress={() => setFullscreenImage(null)}>
                            <Ionicons name="close" size={28} color="white" />
                        </TouchableOpacity>
                        {fullscreenImage && (
                            <Image source={{ uri: fullscreenImage }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.7 }} resizeMode="contain" />
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}