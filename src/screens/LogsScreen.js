import React, { useState, useEffect, useContext } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
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
        return <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 200, borderRadius: 10, marginTop: 10, resizeMode: 'cover' }} />;
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
            <TouchableOpacity onPress={playSound} style={styles.audioButton}>
                {loadingAudio ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>
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
        const cardStyle = isThought ? styles.cardThought : styles.card;
        const icon = isThought ? "💡" : "📖";

        return (
            <TouchableOpacity
                style={cardStyle}
                onPress={() => setExpandedId(isExpanded ? null : item._id)}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeader}>
                    <Text style={{ fontSize: 22, marginRight: 12 }}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{item.title || "Untitled"}</Text>
                        <Text style={styles.date}>{item.date}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: '#ccc' }}>{isExpanded ? "▲" : "▼"}</Text>
                </View>

                {isExpanded && (
                    <View style={styles.body}>
                        <Text style={styles.contentText}>
                            {decryptedContent || <Text style={{ fontStyle: 'italic', color: '#999' }}>(Empty)</Text>}
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
            <View style={styles.centerContainer}>
                <Text style={styles.lockIcon}>🔐</Text>
                <Text style={styles.lockTitle}>Vault Locked</Text>
                <Text style={{ marginBottom: 20, color: '#666' }}>Enter Passkey to decrypt logs.</Text>

                <TouchableOpacity
                    style={[styles.bioButton, !hasSavedPasskey && styles.bioButtonDisabled]}
                    onPress={attemptBiometric} disabled={!hasSavedPasskey}
                >
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>
                        {hasSavedPasskey ? "Use Biometrics" : "Biometrics Unavailable"}
                    </Text>
                </TouchableOpacity>

                <Text style={{ marginVertical: 15, color: '#aaa' }}>- OR -</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Enter Passkey (e.g. 1111)"
                    secureTextEntry
                    keyboardType="numeric"
                    value={passkeyInput}
                    onChangeText={setPasskeyInput}
                />
                <Button title="Unlock / Preview" onPress={handleManualUnlock} />
            </View>
        );
    }

    // --- MAIN LIST STATE ---
    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>
                    📜 Logs
                    {tempKey && <Text style={{ fontSize: 16, color: 'red', fontWeight: 'normal' }}> (Preview Mode)</Text>}
                </Text>
                <TouchableOpacity onPress={handleRefresh} style={styles.reloadButton}>
                    <Text style={{ fontSize: 24 }}>🔄</Text>
                </TouchableOpacity>
            </View>

            <TextInput
                style={styles.searchBar}
                placeholder="🔍 Search Title or Date..."
                value={searchQuery}
                onChangeText={handleSearch}
            />

            {loading ? (
                <ActivityIndicator size="large" color="black" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    contentContainerStyle={{ paddingBottom: 30 }}
                    ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: '#999' }}>No entries found.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f4', padding: 20, paddingTop: 50 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    header: { fontSize: 28, fontWeight: 'bold', color: '#333' },
    reloadButton: { padding: 5 },

    // Cards
    card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 15, padding: 15, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
    cardThought: { backgroundColor: '#fffdf0', borderRadius: 12, marginBottom: 15, padding: 15, borderLeftWidth: 4, borderLeftColor: '#FFC107', elevation: 3 },

    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    title: { fontWeight: 'bold', color: '#444', fontSize: 16 },
    date: { color: '#888', fontStyle: 'italic', fontSize: 12, marginTop: 2 },

    body: { marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderColor: '#eee' },
    contentText: { fontSize: 16, lineHeight: 24, color: '#333', marginBottom: 10 },

    // Media & Audio
    audioButton: { backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, marginTop: 10, alignItems: 'center', width: '100%' },

    // Lock Screen
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f4f4f4' },
    lockIcon: { fontSize: 60, marginBottom: 10 },
    lockTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    bioButton: { backgroundColor: '#2196F3', padding: 12, borderRadius: 8, width: '100%', alignItems: 'center' },
    bioButtonDisabled: { backgroundColor: '#ccc' },
    input: { width: '100%', borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 15, backgroundColor: 'white', fontSize: 16, textAlign: 'center' },

    searchBar: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0' }
});