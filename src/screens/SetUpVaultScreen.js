import React, { useState, useContext } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
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
            style={styles.container}
        >
            <View style={styles.content}>
                <Text style={styles.icon}>🛡️</Text>
                <Text style={styles.title}>Secure Your Vault</Text>

                <Text style={styles.warning}>
                    Create a Passkey that is known only to you.
                    {"\n\n"}
                    <Text style={{ fontWeight: 'bold', color: '#d32f2f' }}>
                        ⚠️ If you lose this passkey, your journal entries cannot be recovered by anyone, including us.
                    </Text>
                </Text>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Create Passkey</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. 1111"
                        placeholderTextColor="#aaa"
                        secureTextEntry
                        keyboardType="default" // Or 'default' for alphanumeric
                        value={passkey}
                        onChangeText={setPasskey}
                        maxLength={6}
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Confirm Passkey</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Re-enter passkey"
                        placeholderTextColor="#aaa"
                        secureTextEntry
                        keyboardType="numeric"
                        value={confirmPasskey}
                        onChangeText={setConfirmPasskey}
                        maxLength={6}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleCreate}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>🔒 Encrypt & Create Vault</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    content: { flex: 1, padding: 30, justifyContent: 'center' },
    icon: { fontSize: 60, textAlign: 'center', marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 20 },
    warning: {
        backgroundColor: '#fff3e0',
        padding: 15,
        borderRadius: 8,
        color: '#e65100',
        lineHeight: 22,
        marginBottom: 30,
        borderLeftWidth: 4,
        borderLeftColor: '#ff9800'
    },
    inputContainer: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8, textTransform: 'uppercase' },
    input: {
        backgroundColor: '#f5f5f5',
        padding: 15,
        borderRadius: 10,
        fontSize: 18,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        color: '#333'
    },
    button: {
        backgroundColor: '#000',
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5
    },
    buttonDisabled: { backgroundColor: '#999' },
    buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});