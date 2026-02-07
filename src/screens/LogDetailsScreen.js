import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, Image,
    ActivityIndicator, Dimensions, Modal, TouchableWithoutFeedback, Alert,
    InteractionManager
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import CryptoService from '../services/CryptoService';
import { Audio, Video, ResizeMode } from 'expo-av'; // <--- Added Video
import * as FileSystem from 'expo-file-system/legacy';

const MEDIA_CACHE = new Map();

export default function LogDetailsScreen({ route, navigation }) {
    const { userToken } = useContext(AuthContext);
    const { entry, activeKey } = route.params;

    const [decryptedContent, setDecryptedContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [fullscreenImage, setFullscreenImage] = useState(null);

    const isMounted = useRef(true);
    const isThought = entry.type === 'THOUGHT';

    useEffect(() => {
        isMounted.current = true;
        const task = InteractionManager.runAfterInteractions(() => {
            if (isMounted.current) decryptData();
        });
        return () => {
            isMounted.current = false;
            task.cancel();
        };
    }, []);

    const decryptData = async () => {
        setTimeout(() => {
            if (!isMounted.current) return;

            try {
                const result = CryptoService.decrypt(entry.content, activeKey);

                // --- FIX: HANDLE EMPTY STRINGS CORRECTLY ---
                // We check if 'text' property exists, not if it's truthy (which fails on "")
                let text = result;
                if (typeof result === 'object' && result !== null && 'text' in result) {
                    text = result.text;
                }

                if (isMounted.current) {
                    setDecryptedContent(text);
                    setLoading(false);
                }
            } catch (e) {
                if (isMounted.current) setLoading(false);
            }
        }, 100);
    };

    // --- COMPONENT: MEDIA VIEWER (Images) ---
    const MediaViewer = ({ filename }) => {
        const [imageUrl, setImageUrl] = useState(null);
        const [loadingImg, setLoadingImg] = useState(true);
        const isComponentMounted = useRef(true);

        useEffect(() => {
            isComponentMounted.current = true;
            const timer = setTimeout(() => {
                if (!isComponentMounted.current) return;
                if (MEDIA_CACHE.has(filename)) {
                    setImageUrl(MEDIA_CACHE.get(filename));
                    setLoadingImg(false);
                } else {
                    loadMedia();
                }
            }, 500);
            return () => { isComponentMounted.current = false; clearTimeout(timer); };
        }, []);

        const loadMedia = async () => {
            try {
                if (!isComponentMounted.current) return;
                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken } });
                if (!isComponentMounted.current) return;

                const decryptedBase64 = CryptoService.decrypt(res.data, activeKey);
                let base64Str = decryptedBase64;
                if (typeof decryptedBase64 === 'object' && decryptedBase64 !== null && 'text' in decryptedBase64) {
                    base64Str = decryptedBase64.text;
                }

                const finalUri = `data:image/jpeg;base64,${base64Str}`;
                MEDIA_CACHE.set(filename, finalUri);

                if (isComponentMounted.current) {
                    setImageUrl(finalUri);
                    setLoadingImg(false);
                }
            } catch (e) { if (isComponentMounted.current) setLoadingImg(false); }
        };

        if (loadingImg) return <View className="w-full h-64 bg-secondary/30 rounded-2xl justify-center items-center mt-4"><ActivityIndicator color="#BDE8F5" /></View>;

        return (
            <TouchableOpacity onPress={() => setFullscreenImage(imageUrl)} activeOpacity={0.9}>
                <Image source={{ uri: imageUrl }} className="w-full h-64 rounded-2xl mt-4 bg-gray-900 border border-accent/20" resizeMode="cover" />
            </TouchableOpacity>
        );
    };

    // --- COMPONENT: VIDEO PLAYER (New) ---
    const VideoPlayer = ({ filename }) => {
        const [videoUri, setVideoUri] = useState(null);
        const [loadingVid, setLoadingVid] = useState(true);
        const isComponentMounted = useRef(true);

        useEffect(() => {
            isComponentMounted.current = true;
            loadVideo();
            return () => { isComponentMounted.current = false; };
        }, []);

        const loadVideo = async () => {
            try {
                if (MEDIA_CACHE.has(filename)) {
                    setVideoUri(MEDIA_CACHE.get(filename));
                    setLoadingVid(false);
                    return;
                }

                const res = await api.get(`/entries/media/${filename}`, { headers: { 'x-auth-token': userToken }, responseType: 'text' });

                const decryptedData = CryptoService.decrypt(res.data, activeKey);
                let base64Str = decryptedData;
                if (typeof decryptedData === 'object' && decryptedData !== null && 'text' in decryptedData) {
                    base64Str = decryptedData.text;
                }

                const uri = FileSystem.cacheDirectory + filename + '.mp4';
                await FileSystem.writeAsStringAsync(uri, base64Str, { encoding: 'base64' });

                MEDIA_CACHE.set(filename, uri);
                if (isComponentMounted.current) {
                    setVideoUri(uri);
                    setLoadingVid(false);
                }
            } catch (e) { console.log("Video Error", e); if (isComponentMounted.current) setLoadingVid(false); }
        };

        if (loadingVid) return <View className="w-full h-48 bg-secondary/30 rounded-2xl justify-center items-center mt-4"><ActivityIndicator color="#BDE8F5" /></View>;

        return (
            <View className="w-full h-64 mt-4 bg-black rounded-2xl overflow-hidden border border-accent/20">
                <Video
                    source={{ uri: videoUri }}
                    style={{ width: '100%', height: '100%' }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                />
            </View>
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

                    const decryptedData = CryptoService.decrypt(res.data, activeKey);
                    let base64Str = decryptedData;
                    if (typeof decryptedData === 'object' && decryptedData !== null && 'text' in decryptedData) {
                        base64Str = decryptedData.text;
                    }

                    uri = FileSystem.cacheDirectory + filename + '.m4a';
                    await FileSystem.writeAsStringAsync(uri, base64Str, { encoding: 'base64' });
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

    const handleDelete = () => {
        Alert.alert(
            "Delete Entry",
            "Are you sure? This will permanently delete this log and all attached media.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive", // Shows red on iOS
                    onPress: async () => {
                        try {
                            setLoading(true); // Show loading while deleting
                            await api.delete(`/entries/${entry._id}`, {
                                headers: { 'x-auth-token': userToken }
                            });

                            // Success: Go back to list
                            navigation.goBack();

                        } catch (error) {
                            setLoading(false);
                            console.error(error);
                            Alert.alert("Error", "Could not delete entry.");
                        }
                    }
                }
            ]
        );
    };

    return (
        <View className="flex-1 bg-primary">
            {/* --- HEADER --- */}
            {/* --- HEADER --- */}
            <View className="pt-12 pb-4 px-5 flex-row items-center justify-between border-b border-accent/10 bg-primary z-10">
                {/* Back Button */}
                <TouchableOpacity onPress={() => navigation.goBack()} className="bg-secondary/40 p-2 rounded-full border border-accent/20">
                    <Ionicons name="arrow-back" size={24} color="#BDE8F5" />
                </TouchableOpacity>

                {/* Right Side: Delete + Date */}
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity onPress={handleDelete} className="bg-red-500/20 p-2 rounded-full border border-red-500/30">
                        <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                    </TouchableOpacity>

                    <View className="items-end">
                        <Text className="text-accent/60 font-bold uppercase tracking-widest text-xs">Entry Date</Text>
                        <Text className="text-highlight font-matanya text-xl">{entry.date}</Text>
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>

                {/* --- TITLE HEADER --- */}
                <View className="mb-8 pt-2">
                    <View className="flex-row items-start gap-4">
                        <View className={`p-3 rounded-2xl ${isThought ? 'bg-yellow-500/20' : 'bg-accent/20'}`}>
                            <Ionicons name={isThought ? "bulb" : "book"} size={32} color={isThought ? "#FCD34D" : "#BDE8F5"} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-accent/60 font-bold text-xs uppercase tracking-widest mb-1">
                                {isThought ? "Deep Thought" : "Journal Entry"}
                            </Text>
                            <Text className="text-3xl text-white font-matanya leading-tight pb-4">
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
                        {(entry.media?.length > 0 || entry.audio?.length > 0 || entry.videos?.length > 0) && (
                            <View className="border-t border-accent/10 pt-6">
                                <Text className="text-accent font-bold uppercase tracking-widest mb-4 opacity-70">Attachments</Text>

                                {entry.media?.map((f, i) => <MediaViewer key={`img_${i}`} filename={f} />)}
                                {entry.videos?.map((f, i) => <VideoPlayer key={`vid_${i}`} filename={f} />)}
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