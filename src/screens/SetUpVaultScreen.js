import React, { useState, useContext } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function SetupVaultScreen({ navigation }) {
    const { setupVault } = useContext(AuthContext);

    const [passkey, setPasskey] = useState('');
    const [confirmPasskey, setConfirmPasskey] = useState('');
    const [loading, setLoading] = useState(false);

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
            Alert.alert("✅ Vault Ready", "Your secure journal is set up.", [
                { text: "Open Journal", onPress: () => navigation.replace('Journal') }
            ]);
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
                <Text className="text-8xl text-center mb-6">🛡️</Text>
                <Text className="text-4xl font-bold font-matanya text-center text-highlight mb-8">Secure Your Vault</Text>

                <View className="bg-secondary/50 p-5 rounded-2xl mb-8 border-l-4 border-orange-500">
                    <Text className="text-white leading-snug text-base">
                        Create a Passkey that is known only to you.
                        {"\n\n"}
                        <Text className="font-bold text-orange-400">
                            ⚠️ If you lose this passkey, your journal entries cannot be recovered by anyone, including us.
                        </Text>
                    </Text>
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-bold text-highlight/70 mb-3 uppercase tracking-wider">Create Passkey</Text>
                    <TextInput
                        className="bg-secondary p-5 rounded-2xl text-xl border border-accent/50 text-white tracking-widest text-center"
                        placeholder="e.g. 1111"
                        placeholderTextColor="#BDE8F5"
                        secureTextEntry
                        keyboardType="numeric" // Changed to numeric for passkey
                        value={passkey}
                        onChangeText={setPasskey}
                        maxLength={6}
                    />
                </View>

                <View className="mb-8">
                    <Text className="text-sm font-bold text-highlight/70 mb-3 uppercase tracking-wider">Confirm Passkey</Text>
                    <TextInput
                        className="bg-secondary p-5 rounded-2xl text-xl border border-accent/50 text-white tracking-widest text-center"
                        placeholder="Re-enter passkey"
                        placeholderTextColor="#BDE8F5"
                        secureTextEntry
                        keyboardType="numeric"
                        value={confirmPasskey}
                        onChangeText={setConfirmPasskey}
                        maxLength={6}
                    />
                </View>

                <TouchableOpacity
                    className={`bg-accent p-5 rounded-2xl items-center mt-2 shadow-lg shadow-black/40 ${loading ? 'opacity-50' : ''}`}
                    onPress={handleCreate}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#0F2854" />
                    ) : (
                        <Text className="text-primary text-xl font-bold uppercase tracking-wider">🔒 Encrypt & Create</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}
