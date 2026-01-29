import React, { useState, useEffect, useContext } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput, Button, Image, Alert
} from 'react-native';
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
        return <Image source={{ uri: imageUrl }} className="w-full h-52 rounded-lg mt-3 bg-gray-200 resize-cover" />;
    };

    // --- COMPONENT: AUDIO PLAYER (Voice Notes) ---
    const AudioPlayer = ({ filename }) => {
        const [sound, setSound] = useState();
        const [isPlaying, setIsPlaying] = useState(false);
        const [loadingAudio, setLoadingAudio] = useState(false);

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
            <TouchableOpacity onPress={playSound} className="bg-green-500 p-3 rounded-lg mt-3 items-center w-full">
                {loadingAudio ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Text className="text-white font-bold">
                        {isPlaying ? "⏸ Playing..." : "▶️ Play Voice Note"}
                    </Text>
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
        const cardClass = isThought ? "bg-yellow-50 border-l-4 border-yellow-400" : "bg-white";
        const icon = isThought ? "💡" : "📖";

        return (
            <TouchableOpacity
                className={`${cardClass} rounded-xl mb-4 p-4 shadow-sm`}
                onPress={() => setExpandedId(isExpanded ? null : item._id)}
                activeOpacity={0.8}
            >
                <View className="flex-row items-center">
                    <Text className="text-2xl mr-3">{icon}</Text>
                    <View className="flex-1">
                        <Text className="font-bold text-gray-700 text-base">{item.title || "Untitled"}</Text>
                        <Text className="text-gray-400 italic text-xs mt-1">{item.date}</Text>
                    </View>
                    <Text className="text-lg text-gray-300">{isExpanded ? "▲" : "▼"}</Text>
                </View>

                {isExpanded && (
                    <View className="mt-4 pt-3 border-t border-gray-100">
                        <Text className="text-base leading-6 text-gray-800 mb-3">
                            {decryptedContent || <Text className="italic text-gray-400">(Empty)</Text>}
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
                <Text className="text-6xl mb-6">🔐</Text>
                <Text className="text-4xl font-matanya text-highlight mb-4 text-center">Vault Locked</Text>
                <Text className="mb-8 text-highlight/70 text-center text-base">Enter Passkey to decrypt logs.</Text>

                <TouchableOpacity
                    className={`p-4 rounded-2xl w-full items-center mb-6 shadow-md ${hasSavedPasskey ? 'bg-accent' : 'bg-gray-500'}`}
                    onPress={attemptBiometric} disabled={!hasSavedPasskey}
                >
                    <Text className="text-primary font-bold text-lg uppercase tracking-wider">
                        {hasSavedPasskey ? "Use Biometrics" : "Biometrics Unavailable"}
                    </Text>
                </TouchableOpacity>

                <Text className="my-4 text-highlight/40">- OR -</Text>

                <TextInput
                    className="w-full border-2 border-accent p-4 rounded-2xl mb-6 bg-secondary text-white text-center text-xl tracking-widest"
                    placeholder="Enter Passkey (e.g. 1111)"
                    placeholderTextColor="#B0C4DE"
                    secureTextEntry
                    keyboardType="numeric"
                    value={passkeyInput}
                    onChangeText={setPasskeyInput}
                />

                <TouchableOpacity
                    className="bg-accent/20 border border-accent p-3 rounded-xl w-full items-center"
                    onPress={handleManualUnlock}
                >
                    <Text className="text-highlight font-bold">Unlock with Passkey</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // --- MAIN LIST STATE ---
    return (
        <View className="flex-1 bg-[#f4f4f4] p-5 pt-12">
            <View className="flex-row justify-between items-center mb-4">
                <Text className="text-3xl font-bold text-gray-800">
                    📜 Logs
                    {tempKey && <Text className="text-base text-red-500 font-normal"> (Preview Mode)</Text>}
                </Text>
                <TouchableOpacity onPress={handleRefresh} className="p-1">
                    <Text className="text-2xl">🔄</Text>
                </TouchableOpacity>
            </View>

            <TextInput
                className="bg-white p-3 rounded-lg mb-4 border border-gray-200"
                placeholder="🔍 Search Title or Date..."
                value={searchQuery}
                onChangeText={handleSearch}
            />

            {loading ? (
                <ActivityIndicator size="large" color="black" className="mt-12" />
            ) : (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    contentContainerStyle={{ paddingBottom: 30 }}
                    ListEmptyComponent={<Text className="text-center mt-12 text-gray-400">No entries found.</Text>}
                />
            )}
        </View>
    );
}
