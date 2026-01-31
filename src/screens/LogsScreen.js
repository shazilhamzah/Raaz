import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, Dimensions, TextInput, ScrollView, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = 56;

export default function LogsScreen() {
    const navigation = useNavigation();
    const { userToken, journalKey, unlockVault, unlockWithBiometrics, hasSavedPasskey, getRawKey } = useContext(AuthContext);

    // --- STATE ---
    const [showCalendar, setShowCalendar] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [calendarDays, setCalendarDays] = useState([]);

    // Search & Picker State
    const [searchQuery, setSearchQuery] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

    const [passkeyInput, setPasskeyInput] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tempKey, setTempKey] = useState(null);
    const activeKey = journalKey || tempKey;

    const scrollViewRef = useRef(null);

    useEffect(() => { fetchLogs(); }, []);

    // Regenerate calendar strip whenever selectedDate changes
    useEffect(() => {
        if (showCalendar) generateMonthDays(selectedDate);
    }, [selectedDate, showCalendar]); // Re-run when calendar opens or date changes

    useEffect(() => { if (!activeKey) attemptBiometric(); }, [activeKey]);

    // --- HELPER: Format Date to YYYY-MM-DD (LOCAL TIME) ---
    // This fixes the timezone issue by ignoring UTC completely
    const toLocalISOString = (date) => {
        const year = date.getFullYear();
        // Month is 0-indexed, so add 1. Pad with '0' if needed.
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // --- HELPER: Generate Month Days ---
    const generateMonthDays = (targetDate) => {
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }
        setCalendarDays(days);

        // Auto Scroll to Selected Date
        const dayIndex = targetDate.getDate() - 1;
        setTimeout(() => {
            if (scrollViewRef.current) {
                const offset = (dayIndex * ITEM_WIDTH) - (SCREEN_WIDTH / 2) + (ITEM_WIDTH / 2);
                scrollViewRef.current.scrollTo({ x: Math.max(0, offset), animated: true });
            }
        }, 100);
    };

    // --- DOTS LOGIC ---
    const marksMap = useMemo(() => {
        const map = {};
        entries.forEach(entry => {
            // Entry.date is already "YYYY-MM-DD" from DB
            const dateKey = entry.date;
            if (!map[dateKey]) map[dateKey] = { hasJournal: false, hasThought: false };
            if (entry.type === 'THOUGHT') map[dateKey].hasThought = true;
            else map[dateKey].hasJournal = true;
        });
        return map;
    }, [entries]);

    // --- FILTER LOGIC ---
    const filteredEntries = useMemo(() => {
        let result = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

        // 1. Calendar Filter (Fixed Timezone Bug)
        if (showCalendar) {
            // Convert selectedDate to "YYYY-MM-DD" string using LOCAL time
            const selectedDateString = toLocalISOString(selectedDate);

            // Compare strings directly: "2025-01-31" === "2025-01-31"
            result = result.filter(item => item.date === selectedDateString);
        }

        // 2. Search Filter
        if (searchQuery.trim()) {
            const lowerText = searchQuery.toLowerCase();
            result = result.filter(item => {
                if (item.date.includes(lowerText)) return true;
                if (item.title && item.title.toLowerCase().includes(lowerText)) return true;
                return false;
            });
        }

        return result;
    }, [entries, showCalendar, selectedDate, searchQuery]);

    // --- ACTIONS ---
    const toggleCalendar = () => {
        const newState = !showCalendar;
        setShowCalendar(newState);

        if (newState) {
            // OPENING: Reset to Today
            const today = new Date();
            setSelectedDate(today);
            // Generating days is handled by useEffect now
        }
    };

    const handleJumpToDate = (monthIndex) => {
        const newDate = new Date(pickerYear, monthIndex, 1);
        setSelectedDate(newDate);
        setShowDatePicker(false);
    };

    const attemptBiometric = async () => { await unlockWithBiometrics(); };
    const handleManualUnlock = async () => {
        const verifiedKey = await unlockVault(passkeyInput);
        if (verifiedKey) { setTempKey(null); setPasskeyInput(''); }
        else { setTempKey(getRawKey(passkeyInput)); setPasskeyInput(''); }
    };
    const fetchLogs = async () => {
        try {
            const res = await api.get('/entries', { headers: { 'x-auth-token': userToken } });
            setEntries(res.data);
        } catch (error) { console.log("Error fetching logs", error); }
        finally { setLoading(false); setRefreshing(false); }
    };

    const openLogDetails = (item) => {
        navigation.navigate('LogDetails', { entry: item, activeKey: activeKey });
    };

    // --- RENDERERS ---

    const renderDatePickerModal = () => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return (
            <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                <View className="flex-1 bg-black/80 justify-center items-center px-6">
                    <View className="bg-secondary w-full rounded-3xl border border-accent/20 p-6">
                        <Text className="text-white font-matanya text-2xl text-center mb-6">Jump to Date</Text>

                        <View className="flex-row justify-between items-center mb-6 bg-primary/30 rounded-xl p-2">
                            <TouchableOpacity onPress={() => setPickerYear(pickerYear - 1)} className="p-2">
                                <Ionicons name="chevron-back" size={24} color="#BDE8F5" />
                            </TouchableOpacity>
                            <Text className="text-white text-xl font-bold">{pickerYear}</Text>
                            <TouchableOpacity onPress={() => setPickerYear(pickerYear + 1)} className="p-2">
                                <Ionicons name="chevron-forward" size={24} color="#BDE8F5" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row flex-wrap justify-between">
                            {months.map((m, i) => (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => handleJumpToDate(i)}
                                    className="w-[30%] bg-accent/10 mb-3 py-3 rounded-xl items-center border border-accent/10 active:bg-accent"
                                >
                                    <Text className="text-accent font-bold">{m}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity onPress={() => setShowDatePicker(false)} className="mt-4 py-3 items-center">
                            <Text className="text-red-400 font-bold">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };

    const renderCalendar = () => {
        if (!showCalendar) return null;

        return (
            <View className="mb-4">
                {/* Context Header */}
                <View className="flex-row justify-center items-center mb-4">
                    <TouchableOpacity
                        onPress={() => { setPickerYear(selectedDate.getFullYear()); setShowDatePicker(true); }}
                        className="flex-row items-center bg-secondary/40 px-4 py-1.5 rounded-full border border-accent/20"
                    >
                        <Text className="text-accent/90 text-xs font-bold uppercase tracking-widest mr-2">
                            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color="#BDE8F5" />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    ref={scrollViewRef}
                >
                    {calendarDays.map((date, index) => {
                        // Use string comparison for selection highlighting
                        const isSelected = toLocalISOString(date) === toLocalISOString(selectedDate);
                        const dayName = date.toLocaleDateString('en-US', { weekday: 'narrow' });
                        const dayNum = date.getDate();
                        const dateKey = toLocalISOString(date);
                        const marks = marksMap[dateKey] || {};

                        return (
                            <TouchableOpacity
                                key={index}
                                onPress={() => setSelectedDate(date)}
                                className={`items-center mx-1.5 p-2 rounded-2xl border ${isSelected ? 'bg-secondary/40 border-accent' : 'bg-transparent border-transparent'}`}
                            >
                                <Text className="text-accent/50 text-xs font-bold mb-1">{dayName}</Text>

                                <View className={`w-8 h-8 items-center justify-center rounded-full ${isSelected ? 'bg-accent' : 'bg-transparent'}`}>
                                    <Text className={`text-base font-bold ${isSelected ? 'text-primary' : 'text-white'}`}>
                                        {dayNum}
                                    </Text>
                                </View>

                                {/* DOTS */}
                                <View className="flex-row gap-1 mt-1 h-2">
                                    {marks.hasJournal && <View className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                                    {marks.hasThought && <View className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        );
    };

    const renderItem = ({ item }) => {
        const isThought = item.type === 'THOUGHT';
        const cardClass = isThought
            ? "bg-secondary/30 border-l-4 border-yellow-500/70"
            : "bg-secondary/20 border-l-4 border-blue-400";

        return (
            <TouchableOpacity
                className={`${cardClass} rounded-2xl mb-3 p-4 border border-accent/10 flex-row items-center justify-between`}
                onPress={() => openLogDetails(item)}
                activeOpacity={0.7}
            >
                <View className="flex-row items-center flex-1">
                    <View className={`p-3 rounded-xl mr-4 ${isThought ? "bg-yellow-500/20" : "bg-accent/20"}`}>
                        <Ionicons name={isThought ? "bulb-outline" : "book-outline"} size={20} color={isThought ? "#FCD34D" : "#BDE8F5"} />
                    </View>
                    <View className="flex-1">
                        <Text className="font-bold text-white text-base font-matanya tracking-wide mb-1" numberOfLines={1}>
                            {item.title || "Untitled"}
                        </Text>
                        <View className="flex-row items-center justify-between mr-2">
                            <Text className="text-accent/50 text-xs font-semibold">{item.date}</Text>
                            <View className={`px-2 py-0.5 rounded-md ${isThought ? 'bg-yellow-500/10' : 'bg-blue-500/20'}`}>
                                <Text className={`text-[10px] font-bold uppercase ${isThought ? 'text-yellow-400' : 'text-blue-300'}`}>
                                    {isThought ? 'Thought' : 'Log'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (!activeKey) {
        return (
            <View className="flex-1 justify-center items-center p-8 bg-primary">
                <View className="bg-accent/10 p-6 rounded-full mb-6 border border-accent/30">
                    <Ionicons name="lock-closed" size={64} color="#BDE8F5" />
                </View>
                <Text className="text-4xl font-matanya text-highlight mb-4 text-center tracking-widest">Vault Locked</Text>
                <TouchableOpacity onPress={attemptBiometric} disabled={!hasSavedPasskey} className={`flex-row p-5 rounded-2xl w-full items-center justify-center mb-6 border border-accent/20 ${hasSavedPasskey ? 'bg-accent' : 'bg-gray-700 opacity-50'}`}>
                    <Ionicons name="finger-print" size={24} color="#0F2854" style={{ marginRight: 10 }} />
                    <Text className="text-primary font-bold text-lg uppercase tracking-wider">{hasSavedPasskey ? "Biometric Unlock" : "No Biometrics"}</Text>
                </TouchableOpacity>
                <TextInput className="w-full border border-accent/50 p-5 rounded-2xl mb-6 bg-secondary text-white text-center text-2xl tracking-[5px] font-bold" placeholder="••••" placeholderTextColor="#B0C4DE" secureTextEntry keyboardType="default" value={passkeyInput} onChangeText={setPasskeyInput} maxLength={6} />
                <TouchableOpacity className="bg-secondary/50 border border-accent/50 p-4 rounded-xl w-full items-center" onPress={handleManualUnlock}>
                    <Text className="text-highlight font-bold tracking-wider">UNLOCK VAULT</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-primary pt-12 px-5">
            {/* HEADER */}
            <View className="flex-row justify-between items-center mb-4">
                <Text className="text-3xl font-matanya text-highlight tracking-widest uppercase">Journal</Text>

                <TouchableOpacity
                    onPress={toggleCalendar}
                    className={`p-2.5 rounded-full border ${showCalendar ? 'bg-accent border-accent' : 'bg-secondary/40 border-accent/20'}`}
                >
                    <Ionicons name="calendar" size={22} color={showCalendar ? "#0F2854" : "#BDE8F5"} />
                </TouchableOpacity>
            </View>

            {/* SEARCH BAR (Always Visible) */}
            <View className="mb-4">
                <View className="flex-row items-center bg-secondary/30 border border-accent/20 rounded-2xl px-4">
                    <Ionicons name="search" size={20} color="rgba(189, 232, 245, 0.5)" />
                    <TextInput
                        className="flex-1 p-3 text-white font-semibold text-base"
                        placeholder="Search logs..."
                        placeholderTextColor="rgba(189, 232, 245, 0.3)"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {/* CALENDAR */}
            {renderCalendar()}
            {renderDatePickerModal()}

            {/* LIST */}
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
                    onRefresh={() => { setRefreshing(true); fetchLogs(); }}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View className="items-center mt-20 opacity-50">
                            <Ionicons name="documents-outline" size={64} color="#4988C4" />
                            <Text className="text-center mt-4 text-accent text-lg">
                                {showCalendar ? "No entries for this date." : "No entries found."}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}