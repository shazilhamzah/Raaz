import React, { useState, useContext } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function SetupVaultScreen() { // Removed navigation prop
    const { setupVault } = useContext(AuthContext);

    const [passkey, setPasskey] = useState('');
    const [confirmPasskey, setConfirmPasskey] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPasskey, setShowPasskey] = useState(false);

    const handleCreate = async () => {
        // 1. Validation
        if (passkey.length < 4) {
            Alert.alert("Too Short", "Passkey must be at least 4 characters.");
            return;
        }
        if (passkey !== confirmPasskey) {
            Alert.alert("Mismatch", "Passkeys do not match.");
            return;
        }

        setLoading(true);

        // 2. Call Context Action
        // This encrypts 'VALID' -> sends to Cloud -> sets journalKey in memory
        const success = await setupVault(passkey);

        setLoading(false);

        if (success) {
            // SUCCESS: The App.js RootNavigator will automatically switch to "MainTabs"
            // because isVaultInitialized becomes true in AuthContext.
            // No manual navigation needed.
        } else {
            Alert.alert("Error", "Could not setup vault. Please try again.");
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 bg-primary"
        >
            <View className="flex-1 p-8 justify-center">
                <View className="items-center mb-8">
                    <View className="bg-secondary/30 p-6 rounded-full border border-accent/20 mb-6 shadow-lg shadow-accent/10">
                        <Ionicons name="shield-checkmark-outline" size={80} color="#BDE8F5" />
                    </View>
                    <Text className="text-4xl font-bold font-matanya text-center text-highlight tracking-widest">
                        Secure Your Vault
                    </Text>
                </View>

                <View className="bg-secondary/40 p-5 rounded-2xl mb-8 border-l-4 border-orange-500 shadow-sm">
                    <Text className="text-white leading-6 text-base">
                        Create a Passkey that is known only to you.
                        {"\n\n"}
                        <Text className="font-bold text-orange-300 flex-row items-center">
                            <Ionicons name="warning" size={16} color="#FDBA74" /> If you lose this passkey, your journal entries cannot be recovered by anyone, including us.
                        </Text>
                    </Text>
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-bold text-highlight/70 mb-3 uppercase tracking-wider ml-1">Create Passkey</Text>
                    <View className="flex-row items-center bg-secondary/80 border border-accent/30 rounded-2xl px-4 py-2">
                        <Ionicons name="key-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
                        <TextInput
                            className="flex-1 text-white text-xl py-3 tracking-widest placeholder:text-highlight/30"
                            placeholder="e.g. 1111"
                            placeholderTextColor="rgba(189, 232, 245, 0.3)"
                            secureTextEntry={!showPasskey}
                            keyboardType="default"
                            value={passkey}
                            onChangeText={setPasskey}
                            maxLength={6}
                        />
                        <TouchableOpacity onPress={() => setShowPasskey(!showPasskey)}>
                            <Ionicons name={showPasskey ? "eye-outline" : "eye-off-outline"} size={22} color="rgba(189, 232, 245, 0.6)" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View className="mb-10">
                    <Text className="text-sm font-bold text-highlight/70 mb-3 uppercase tracking-wider ml-1">Confirm Passkey</Text>
                    <View className="flex-row items-center bg-secondary/80 border border-accent/30 rounded-2xl px-4 py-2">
                        <Ionicons name="checkmark-circle-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
                        <TextInput
                            className="flex-1 text-white text-xl py-3 tracking-widest placeholder:text-highlight/30"
                            placeholder="Re-enter passkey"
                            placeholderTextColor="rgba(189, 232, 245, 0.3)"
                            secureTextEntry={!showPasskey}
                            keyboardType="default"
                            value={confirmPasskey}
                            onChangeText={setConfirmPasskey}
                            maxLength={6}
                        />
                    </View>
                </View>

                <TouchableOpacity
                    className={`bg-accent p-5 rounded-2xl items-center mt-2 shadow-lg shadow-accent/20 flex-row justify-center space-x-2 ${loading ? 'opacity-70' : ''}`}
                    onPress={handleCreate}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#0F2854" />
                    ) : (
                        <>
                            <Ionicons name="lock-closed" size={24} color="#0F2854" style={{ marginRight: 8 }} />
                            <Text className="text-primary text-xl font-bold uppercase tracking-wider">Encrypt & Create</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}
