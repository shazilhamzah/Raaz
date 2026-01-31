import React, { useState, useEffect, useContext } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

export default function LogsScreen({ navigation }) { // <--- Added navigation prop
    const {
        userToken, journalKey, unlockVault, unlockWithBiometrics,
        hasSavedPasskey, getRawKey
    } = useContext(AuthContext);

    const [passkeyInput, setPasskeyInput] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredEntries, setFilteredEntries] = useState([]);

    // STATE: "Garbage View" Key (used if passkey is wrong)
    const [tempKey, setTempKey] = useState(null);

    // LOGIC: Use the Verified Key if available, otherwise use the Temp Key
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
            // Wrong Passkey? Generate Garbage Key
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

    // --- NAVIGATION HANDLER ---
    const openLogDetails = (item) => {
        // We pass the Entry Data AND the Active Key (Verified or Garbage)
        navigation.navigate('LogDetails', {
            entry: item,
            activeKey: activeKey
        });
    };

    // --- RENDER LIST ITEM ---
    const renderItem = ({ item }) => {
        const isThought = item.type === 'THOUGHT';
        const cardClass = isThought
            ? "bg-secondary/30 border-l-4 border-yellow-500/70"
            : "bg-secondary/20 border-l-4 border-accent";

        return (
            <TouchableOpacity
                className={`${cardClass} rounded-2xl mb-4 p-5 border border-accent/10 shadow-sm flex-row items-center justify-between`}
                onPress={() => openLogDetails(item)}
                activeOpacity={0.7}
            >
                <View className="flex-row items-center flex-1">
                    <View className={`p-3 rounded-full mr-4 ${isThought ? "bg-yellow-500/20" : "bg-accent/20"}`}>
                        <Ionicons name={isThought ? "bulb-outline" : "book-outline"} size={24} color={isThought ? "#FCD34D" : "#BDE8F5"} />
                    </View>
                    <View className="flex-1">
                        <Text className="font-bold text-white text-lg font-matanya tracking-wide" numberOfLines={1}>
                            {item.title || "Untitled"}
                        </Text>
                        <Text className="text-accent/60 text-xs mt-1 font-semibold uppercase tracking-wider">
                            {item.date}
                        </Text>
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(189, 232, 245, 0.5)" />
            </TouchableOpacity>
        );
    };

    // --- LOCK SCREEN ---
    if (!activeKey) {
        return (
            <View className="flex-1 justify-center items-center p-8 bg-primary">
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

    // --- MAIN LIST ---
    return (
        <View className="flex-1 bg-primary pt-12 px-5">
            <View className="flex-row justify-between items-center mb-6">
                <View>
                    <Text className="text-3xl font-matanya text-highlight tracking-widest uppercase">
                        Past Entries
                    </Text>
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
        </View>
    );
}