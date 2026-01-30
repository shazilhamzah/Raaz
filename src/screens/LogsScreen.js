import React, { useState, useEffect, useContext } from 'react';
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

export default function LogsScreen() {
    const {
        userToken, journalKey, unlockVault, unlockWithBiometrics,
        hasSavedPasskey, getRawKey
    } = useContext(AuthContext);

    const [passkeyInput, setPasskeyInput] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredEntries, setFilteredEntries] = useState([]);

    // STATE: "Garbage View" Key (used if passkey is wrong)
    const [tempKey, setTempKey] = useState(null);

    // STATE: Fullscreen image viewer
    const [fullscreenImage, setFullscreenImage] = useState(null);

    // LOGIC: Use the Verified Key if available, otherwise use the Temp Key
    const activeKey = journalKey || tempKey;

    useEffect(() => { fetchLogs(); }, []);

    useEffect(() => {
        // Auto-trigger biometrics only if completely locked
        if (!activeKey) attemptBiometric();
    }, [activeKey]);

    const attemptBiometric = async () => {
        await unlockWithBiometrics();
    };

    const handleManualUnlock = async () => {
        // 1. Try Strict Unlock (Checks Canary to see if valid)
        const verifiedKey = await unlockVault(passkeyInput);

        if (verifiedKey) {
            // ✅ Correct Passkey: Clear local temp key, global key is set
            setTempKey(null);
            setPasskeyInput('');
        } else {
            // ❌ Wrong Passkey: Don't show error. Show garbage.
            // We force generate a key from the input without validation.
            const rawKey = getRawKey(passkeyInput);
            setTempKey(rawKey);
            setPasskeyInput('');
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await api.get('/entries', { headers: { 'x-auth-token': userToken } });
            // Sort by Date (Newest first)
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
            // Note: Title is plaintext in DB, so we can search it easily
            if (item.title && item.title.toLowerCase().includes(lowerText)) return true;
            return false;
        });
        setFilteredEntries(filtered);
    };

    // --- COMPONENT: MEDIA VIEWER (Images) ---
    const MediaViewer = ({ filename }) => {
        const [imageUrl, setImageUrl] = useState(null);
        const [loadingImg, setLoadingImg] = useState(true);

        useEffect(() => { loadMedia(); }, []);

        const loadMedia = async () => {
            try {
                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken } });

                // Decrypt with whatever key we have
                const decryptedBase64 = CryptoService.decrypt(res.data, activeKey);

                // Handle Object return {text, success} vs String
                const base64Str = (typeof decryptedBase64 === 'object' && decryptedBase64.text)
                    ? decryptedBase64.text
                    : decryptedBase64;

                setImageUrl(`data:image/jpeg;base64,${base64Str}`);
            } catch (e) {
                console.log("Image Load Fail");
            } finally {
                setLoadingImg(false);
            }
        };

        if (loadingImg) return <ActivityIndicator color="blue" size="small" />;
        return (
            <TouchableOpacity onPress={() => setFullscreenImage(imageUrl)} activeOpacity={0.8}>
                <Image source={{ uri: imageUrl }} className="w-full h-52 rounded-lg mt-3 bg-gray-200 resize-cover" />
            </TouchableOpacity>
        );
    };

    // --- COMPONENT: AUDIO PLAYER (Voice Notes) ---
    const AudioPlayer = ({ filename }) => {
        const [sound, setSound] = useState();
        const [isPlaying, setIsPlaying] = useState(false);
        const [loadingAudio, setLoadingAudio] = useState(false);
        const { userToken, journalKey } = useContext(AuthContext); // Ensure context is available if needed

        const playSound = async () => {
            if (sound) {
                await sound.playAsync();
                setIsPlaying(true);
                return;
            }

            setLoadingAudio(true);
            try {
                // 1. Fetch Encrypted Audio
                const res = await api.get(`/entries/media/${filename}`, {
                    headers: { 'x-auth-token': userToken },
                    responseType: 'text' // Force text so axios doesn't parse JSON
                });

                const cleanData = typeof res.data === 'string' ? res.data.trim() : res.data;

                // 2. Decrypt
                const result = CryptoService.decrypt(cleanData, activeKey);
                const base64Audio = (typeof result === 'object' && result.text) ? result.text : result;

                // 3. Save to Temp File
                const uri = FileSystem.cacheDirectory + filename + '.m4a';
                await FileSystem.writeAsStringAsync(uri, base64Audio, { encoding: 'base64' });

                // 4. Load & Play
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true }
                );

                setSound(newSound);
                setIsPlaying(true);

                // Reset state when playback finishes
                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) setIsPlaying(false);
                });

            } catch (e) {
                Alert.alert("Playback Error", "Could not decrypt audio. (Wrong Passkey?)");
            } finally {
                setLoadingAudio(false);
            }
        };

        useEffect(() => {
            return sound ? () => { sound.unloadAsync(); } : undefined;
        }, [sound]);

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

        if (isExpanded && activeKey) {
            const result = CryptoService.decrypt(item.content, activeKey);
            decryptedContent = (typeof result === 'object' && result.text) ? result.text : result;
        }

        const isThought = item.type === 'THOUGHT';
        // Dark Theme Cards
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

    // --- LOCK SCREEN STATE ---
    if (!activeKey) {
        return (
            <View className="flex-1 justify-center items-center p-8 bg-primary">
                <View className="bg-accent/10 p-6 rounded-full mb-6 border border-accent/30">
                    <Ionicons name="lock-closed" size={64} color="#BDE8F5" />
                </View>

                <Text className="text-4xl font-matanya text-highlight mb-4 text-center tracking-widest">Vault Locked</Text>
                <Text className="mb-10 text-highlight/60 text-center text-base leading-6">
                    This area is encrypted.{"\n"}Enter your passkey to reveal your logs.
                </Text>

                <TouchableOpacity
                    className={`flex-row p-5 rounded-2xl w-full items-center justify-center mb-6 shadow-lg shadow-black/40 border border-accent/20 ${hasSavedPasskey ? 'bg-accent' : 'bg-gray-700 opacity-50'}`}
                    onPress={attemptBiometric} disabled={!hasSavedPasskey}
                >
                    <Ionicons name="finger-print" size={24} color="#0F2854" style={{ marginRight: 10 }} />
                    <Text className="text-primary font-bold text-lg uppercase tracking-wider">
                        {hasSavedPasskey ? "Biometric Unlock" : "No Biometrics"}
                    </Text>
                </TouchableOpacity>

                <View className="flex-row items-center w-full mb-6">
                    <View className="h-[1px] bg-accent/20 flex-1"></View>
                    <Text className="mx-4 text-highlight/30 font-bold text-xs uppercase">Or use Passkey</Text>
                    <View className="h-[1px] bg-accent/20 flex-1"></View>
                </View>

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

    // --- MAIN LIST STATE ---
    return (
        <View className="flex-1 bg-primary pt-12 px-5">
            <View className="flex-row justify-between items-center mb-6">
                <View>
                    <Text className="text-3xl font-matanya text-highlight tracking-widest uppercase">
                        Past Entries
                    </Text>
                    {tempKey && <Text className="text-xs text-red-400 font-bold mt-1 tracking-wide uppercase">⚠️ Preview Mode (Key Unverified)</Text>}
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

            {/* --- FULLSCREEN IMAGE MODAL --- */}
            <Modal
                visible={fullscreenImage !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setFullscreenImage(null)}
            >
                <TouchableWithoutFeedback onPress={() => setFullscreenImage(null)}>
                    <View className="flex-1 bg-black/95 justify-center items-center">
                        <TouchableOpacity
                            className="absolute top-12 right-6 z-10 bg-white/20 p-3 rounded-full"
                            onPress={() => setFullscreenImage(null)}
                        >
                            <Ionicons name="close" size={28} color="white" />
                        </TouchableOpacity>
                        {fullscreenImage && (
                            <Image
                                source={{ uri: fullscreenImage }}
                                style={{
                                    width: Dimensions.get('window').width,
                                    height: Dimensions.get('window').height * 0.7,
                                }}
                                resizeMode="contain"
                            />
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}
