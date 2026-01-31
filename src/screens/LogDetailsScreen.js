import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, Image,
    ActivityIndicator, Dimensions, Modal, TouchableWithoutFeedback, Alert,
    InteractionManager // <--- 1. IMPORT THIS
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import CryptoService from '../services/CryptoService';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// Local cache for this screen session
const MEDIA_CACHE = new Map();

export default function LogDetailsScreen({ route, navigation }) {
    const { userToken } = useContext(AuthContext);
    const { entry, activeKey } = route.params;

    const [decryptedContent, setDecryptedContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [fullscreenImage, setFullscreenImage] = useState(null);

    // Track if screen is mounted to prevent updates after going back
    const isMounted = useRef(true);

    const isThought = entry.type === 'THOUGHT';

    useEffect(() => {
        isMounted.current = true;

        // 2. WAIT FOR NAVIGATION ANIMATION TO FINISH BEFORE DECRYPTING
        const task = InteractionManager.runAfterInteractions(() => {
            decryptData();
        });

        return () => {
            isMounted.current = false;
            task.cancel(); // Cancel if user goes back quickly
        };
    }, []);

    const decryptData = async () => {
        // Double check mount status before heavy work
        if (!isMounted.current) return;

        // Force next tick to unblock UI
        setTimeout(() => {
            if (!isMounted.current) return;

            try {
                const result = CryptoService.decrypt(entry.content, activeKey);
                const text = (typeof result === 'object' && result.text) ? result.text : result;

                if (isMounted.current) {
                    setDecryptedContent(text);
                    setLoading(false);
                }
            } catch (e) {
                if (isMounted.current) setLoading(false);
            }
        }, 100);
    };

    // --- COMPONENT: MEDIA VIEWER ---
    const MediaViewer = ({ filename }) => {
        const [imageUrl, setImageUrl] = useState(null);
        const [loadingImg, setLoadingImg] = useState(true);
        // We need a local ref for this specific component instance too
        const isComponentMounted = useRef(true);

        useEffect(() => {
            isComponentMounted.current = true;

            // 3. DELAY IMAGE LOAD SLIGHTLY TO PRIORITIZE UI RESPONSE
            const timer = setTimeout(() => {
                if (!isComponentMounted.current) return;

                if (MEDIA_CACHE.has(filename)) {
                    setImageUrl(MEDIA_CACHE.get(filename));
                    setLoadingImg(false);
                } else {
                    loadMedia();
                }
            }, 500); // 500ms delay to let other things settle

            return () => {
                isComponentMounted.current = false;
                clearTimeout(timer);
            };
        }, []);

        const loadMedia = async () => {
            try {
                if (!isComponentMounted.current) return;

                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken } });

                // Heavy decryption
                if (!isComponentMounted.current) return;

                const decryptedBase64 = CryptoService.decrypt(res.data, activeKey);
                const base64Str = (typeof decryptedBase64 === 'object' && decryptedBase64.text) ? decryptedBase64.text : decryptedBase64;
                const finalUri = `data:image/jpeg;base64,${base64Str}`;

                MEDIA_CACHE.set(filename, finalUri);

                if (isComponentMounted.current) {
                    setImageUrl(finalUri);
                    setLoadingImg(false);
                }
            } catch (e) {
                if (isComponentMounted.current) setLoadingImg(false);
            }
        };

        if (loadingImg) return <View className="w-full h-64 bg-secondary/30 rounded-2xl justify-center items-center mt-4"><ActivityIndicator color="#BDE8F5" /></View>;

        return (
            <TouchableOpacity onPress={() => setFullscreenImage(imageUrl)} activeOpacity={0.9}>
                <Image source={{ uri: imageUrl }} className="w-full h-64 rounded-2xl mt-4 bg-gray-900 border border-accent/20" resizeMode="cover" />
            </TouchableOpacity>
        );
    };

    // --- COMPONENT: AUDIO PLAYER ---
    const AudioPlayer = ({ filename }) => {
        const [sound, setSound] = useState();
        const [isPlaying, setIsPlaying] = useState(false);
        const [loadingAudio, setLoadingAudio] = useState(false);
        const isComponentMounted = useRef(true);

        useEffect(() => {
            isComponentMounted.current = true;
            return () => { isComponentMounted.current = false; if (sound) sound.unloadAsync(); };
        }, [sound]);

        const playSound = async () => {
            if (sound) { await sound.playAsync(); setIsPlaying(true); return; }
            setLoadingAudio(true);
            try {
                let uri;
                if (MEDIA_CACHE.has(filename)) {
                    uri = MEDIA_CACHE.get(filename);
                } else {
                    const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken }, responseType: 'text' });
                    const cleanData = typeof res.data === 'string' ? res.data.trim() : res.data;
                    const result = CryptoService.decrypt(cleanData, activeKey);
                    const base64Audio = (typeof result === 'object' && result.text) ? result.text : result;
                    uri = FileSystem.cacheDirectory + filename + '.m4a';
                    await FileSystem.writeAsStringAsync(uri, base64Audio, { encoding: 'base64' });
                    MEDIA_CACHE.set(filename, uri);
                }

                if (!isComponentMounted.current) return;

                const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
                setSound(newSound);
                setIsPlaying(true);
                newSound.setOnPlaybackStatusUpdate((status) => { if (status.didJustFinish && isComponentMounted.current) setIsPlaying(false); });
            } catch (e) { Alert.alert("Error", "Playback failed."); }
            finally { if (isComponentMounted.current) setLoadingAudio(false); }
        };

        return (
            <TouchableOpacity onPress={playSound} className="flex-row items-center bg-secondary/50 border border-accent/30 p-4 rounded-xl mt-3 w-full">
                {loadingAudio ? <ActivityIndicator color="#BDE8F5" size="small" /> : (
                    <>
                        <View className="bg-accent/20 p-2 rounded-full mr-3">
                            <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#BDE8F5" />
                        </View>
                        <Text className="text-highlight font-bold tracking-wide">{isPlaying ? "Playing Voice Note..." : "Play Voice Recording"}</Text>
                    </>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View className="flex-1 bg-primary">
            {/* --- HEADER --- */}
            <View className="pt-12 pb-4 px-5 flex-row items-center justify-between border-b border-accent/10 bg-primary z-10">
                <TouchableOpacity onPress={() => navigation.goBack()} className="bg-secondary/40 p-2 rounded-full border border-accent/20">
                    <Ionicons name="arrow-back" size={24} color="#BDE8F5" />
                </TouchableOpacity>
                <View className="items-end">
                    <Text className="text-accent/60 font-bold uppercase tracking-widest text-xs">Entry Date</Text>
                    <Text className="text-highlight font-matanya text-xl">{entry.date}</Text>
                </View>
            </View>

            <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
                {/* --- TITLE CARD --- */}
                <View className={`p-6 rounded-3xl mb-8 border border-accent/20 shadow-lg ${isThought ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-secondary/30'}`}>
                    <View className="flex-row items-start gap-6">
                        <View className={`p-3 rounded-2xl ${isThought ? 'bg-yellow-500/20' : 'bg-accent/20'}`}>
                            <Ionicons name={isThought ? "bulb" : "book"} size={32} color={isThought ? "#FCD34D" : "#BDE8F5"} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-accent/60 font-bold text-xs uppercase tracking-widest mb-1">
                                {isThought ? "Deep Thought" : "Journal Entry"}
                            </Text>
                            <Text className="text-3xl text-white font-matanya leading-9 shadow-black/50 shadow-md">
                                {entry.title || "Untitled Entry"}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* --- TEXT CONTENT --- */}
                {loading ? (
                    <ActivityIndicator size="large" color="#4988C4" className="mt-10" />
                ) : (
                    <View>
                        <Text className="text-gray-200 text-lg leading-8 font-light tracking-wide mb-8">
                            {decryptedContent || <Text className="italic text-gray-500">No text content.</Text>}
                        </Text>

                        {/* --- MEDIA SECTION --- */}
                        {(entry.media?.length > 0 || entry.audio?.length > 0) && (
                            <View className="border-t border-accent/10 pt-6">
                                <Text className="text-accent font-bold uppercase tracking-widest mb-4 opacity-70">Attachments</Text>

                                {entry.media?.map((f, i) => <MediaViewer key={`img_${i}`} filename={f} />)}
                                {entry.audio?.map((f, i) => <AudioPlayer key={`aud_${i}`} filename={f} />)}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* --- FULLSCREEN IMAGE MODAL --- */}
            <Modal visible={fullscreenImage !== null} transparent={true} animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
                <TouchableWithoutFeedback onPress={() => setFullscreenImage(null)}>
                    <View className="flex-1 bg-black/95 justify-center items-center">
                        <TouchableOpacity className="absolute top-12 right-6 z-10 bg-white/20 p-3 rounded-full" onPress={() => setFullscreenImage(null)}>
                            <Ionicons name="close" size={28} color="white" />
                        </TouchableOpacity>
                        {fullscreenImage && (
                            <Image source={{ uri: fullscreenImage }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.8 }} resizeMode="contain" />
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}
