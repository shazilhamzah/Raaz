import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Button, Image } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import CryptoService from '../services/CryptoService';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

export default function LogsScreen() {
    const { userToken, journalKey, unlockVault, unlockWithBiometrics } = useContext(AuthContext);

    const [passkeyInput, setPasskeyInput] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false); // <--- NEW STATE
    const [expandedId, setExpandedId] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredEntries, setFilteredEntries] = useState([]);

    // 1. Fetch logs on mount
    useEffect(() => {
        fetchLogs();
    }, []);

    // 2. Auto-trigger FaceID when locked
    useEffect(() => {
        if (!journalKey) {
            attemptBiometric();
        }
    }, [journalKey]);

    const attemptBiometric = async () => {
        await unlockWithBiometrics();
    };

    const handleManualUnlock = async () => {
        await unlockVault(passkeyInput);
    };

    // --- MAIN FETCH FUNCTION ---
    const fetchLogs = async () => {
        try {
            const res = await api.get('/entries', {
                headers: { 'x-auth-token': userToken }
            });
            // Sort by date (Newest first)
            const sorted = res.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setEntries(sorted);
            setFilteredEntries(sorted); // <--- Initialize filtered list
        } catch (error) {
            console.log("Error fetching logs", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSearch = (text) => {
        setSearchQuery(text);

        if (!text.trim()) {
            setFilteredEntries(entries); // Reset if empty
            return;
        }

        const lowerText = text.toLowerCase();

        const filtered = entries.filter(item => {
            // 1. Search Date (Plain Text)
            if (item.date.includes(lowerText)) return true;

            // 2. Search Title (Plain Text or Encrypted?)
            // In our schema, Title is stored as Plain Text. 
            // If you encrypted titles, you would decrypt here first.
            if (item.title && item.title.toLowerCase().includes(lowerText)) return true;

            // 3. (Optional) Search Body? 
            // Warning: Slow for 100+ entries, but powerful.
            // try {
            //    const decrypted = CryptoService.decrypt(item.content, journalKey);
            //    if (decrypted.toLowerCase().includes(lowerText)) return true;
            // } catch(e) { return false; }

            return false;
        });

        setFilteredEntries(filtered);
    };

    // --- WRAPPER FOR PULL-TO-REFRESH ---
    const handleRefresh = () => {
        setRefreshing(true);
        fetchLogs();
    };

    // ... (MediaViewer Component stays the same) ...
    const MediaViewer = ({ filename }) => {
        const [imageUrl, setImageUrl] = useState(null);
        const [loadingMedia, setLoadingMedia] = useState(true);

        useEffect(() => { loadMedia(); }, []);

        const loadMedia = async () => {
            try {
                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken } });
                const decryptedBase64 = CryptoService.decrypt(res.data, journalKey);
                setImageUrl(`data:image/jpeg;base64,${decryptedBase64}`);
            } catch (e) { console.log("Failed to load image"); }
            finally { setLoadingMedia(false); }
        };

        if (loadingMedia) return <ActivityIndicator color="blue" />;
        return <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 200, borderRadius: 10, marginTop: 10, resizeMode: 'cover' }} />;
    };

    // ... (AudioPlayer Component stays the same) ...
    const AudioPlayer = ({ filename }) => {
        const [sound, setSound] = useState();
        const [loading, setLoading] = useState(false);

        const playSound = async () => {
            if (sound) { await sound.playAsync(); return; }
            setLoading(true);
            try {
                const res = await api.get(`/entries/media/${filename}`, {
                    headers: { 'x-auth-token': userToken },
                    responseType: 'text' // Force text for audio
                });
                const cleanData = typeof res.data === 'string' ? res.data.trim() : res.data;
                const decryptedBase64 = CryptoService.decrypt(cleanData, journalKey);

                const uri = FileSystem.cacheDirectory + filename + '.m4a';
                await FileSystem.writeAsStringAsync(uri, decryptedBase64, { encoding: 'base64' });

                const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
                setSound(newSound);
            } catch (e) { alert("Audio corrupted or wrong passkey"); }
            finally { setLoading(false); }
        };

        useEffect(() => { return sound ? () => { sound.unloadAsync(); } : undefined; }, [sound]);

        return (
            <TouchableOpacity onPress={playSound} style={styles.audioButton}>
                <Text style={{ color: 'white' }}>{loading ? "⏳ Decrypting..." : "▶️ Play Voice Note"}</Text>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => {
        const isExpanded = expandedId === item._id;
        const decryptedContent = isExpanded ? CryptoService.decrypt(item.content, journalKey) : '';

        // Determine Icon and Style based on Type
        const isThought = item.type === 'THOUGHT';
        const icon = isThought ? "💡" : "📖";
        const cardStyle = isThought ? styles.cardThought : styles.card;

        return (
            <TouchableOpacity style={cardStyle} onPress={() => setExpandedId(isExpanded ? null : item._id)} activeOpacity={0.8}>
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, marginRight: 10 }}>{icon}</Text>
                        <View>
                            <Text style={styles.title}>{item.title || "Untitled"}</Text>
                            <Text style={styles.date}>{item.date}</Text>
                        </View>
                    </View>
                </View>

                {isExpanded && (
                    <View style={styles.body}>
                        <Text style={styles.contentText}>{decryptedContent}</Text>
                        {item.media && (Array.isArray(item.media) ? item.media : [item.media]).map((f, i) => f && <MediaViewer key={i} filename={f} />)}
                        {item.audio && item.audio.map((f, i) => <AudioPlayer key={`aud_${i}`} filename={f} />)}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // --- RENDER: IF LOCKED ---
    if (!journalKey) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.lockIcon}>🔐</Text>
                <Text style={styles.lockTitle}>Vault Locked</Text>
                <Text style={styles.lockText}>Authenticate to view archives.</Text>
                <Button title="Use FaceID / Fingerprint" onPress={attemptBiometric} />
                <Text style={{ marginVertical: 10, color: '#ccc' }}>- OR -</Text>
                <TextInput style={styles.input} placeholder="Enter Passkey" secureTextEntry value={passkeyInput} onChangeText={setPasskeyInput} />
                <Button title="Unlock Vault" onPress={handleManualUnlock} />
            </View>
        );
    }

    // --- RENDER: IF UNLOCKED ---
    return (
        <View style={styles.container}>
            {/* Header with Reload Button */}
            <View style={styles.headerRow}>
                <Text style={styles.header}>📜 Past Chronicles</Text>
                <TouchableOpacity onPress={handleRefresh} style={styles.reloadButton}>
                    <Text style={{ fontSize: 24 }}>🔄</Text>
                </TouchableOpacity>
            </View>

            <TextInput
                style={styles.searchBar}
                placeholder="🔍 Search by Title or Date..."
                value={searchQuery}
                onChangeText={handleSearch}
            />

            {loading ? (
                <ActivityIndicator size="large" color="#000" />
            ) : (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    // NEW: Pull to Refresh props
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f4', padding: 20, paddingTop: 50 },

    // Header Styles
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    header: { fontSize: 28, fontWeight: 'bold', color: '#333' },
    reloadButton: { padding: 5 },

    card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 15, padding: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontWeight: 'bold', color: '#555' },
    date: { color: '#888', fontStyle: 'italic' },
    body: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
    contentText: { fontSize: 16, lineHeight: 24, color: '#222' },
    centerContainer: { flex: 1, justifyContent: 'center', padding: 40, alignItems: 'center', backgroundColor: '#f4f4f4' },
    lockIcon: { fontSize: 50, marginBottom: 20 },
    lockTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    lockText: { textAlign: 'center', color: '#666', marginBottom: 20 },
    input: { width: '100%', borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, marginBottom: 15, backgroundColor: 'white' },
    audioButton: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 5, marginTop: 5, alignItems: 'center' },
    searchBar: {
        backgroundColor: 'white',
        padding: 10,
        borderRadius: 8,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#ddd'
    },
    // Existing card style...
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        marginBottom: 15,
        padding: 15,
        // ... shadow props
    },
    // New Thought style (maybe slightly different color or border)
    cardThought: {
        backgroundColor: '#fffdf0', // Slightly yellow/cream for thoughts
        borderRadius: 12,
        marginBottom: 15,
        padding: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#FFC107', // Gold bar on left
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
    },
});