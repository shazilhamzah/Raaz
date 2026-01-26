import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import api from '../services/api';
import CryptoService from '../services/CryptoService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [userSalt, setUserSalt] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [journalKey, setJournalKey] = useState(null);

    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        setIsLoading(true);
        try {
            let token = await AsyncStorage.getItem('userToken');
            let salt = await AsyncStorage.getItem('userSalt');
            if (token) {
                setUserToken(token);
                setUserSalt(salt);
            }
        } catch (e) {
            console.log(e);
        }
        setIsLoading(false);
    };

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const res = await api.post('/auth/login', { email, password });
            const { token, encryption_salt } = res.data;

            setUserToken(token);
            setUserSalt(encryption_salt);

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('userSalt', encryption_salt);
        } catch (e) {
            alert("Login Failed");
        } finally {
            setIsLoading(false);
        }
    };

    // --- NEW: BIOMETRIC UNLOCK ---
    const unlockWithBiometrics = async () => {
        try {
            // 1. Check if we have a saved passkey to retrieve
            const savedPasskey = await SecureStore.getItemAsync('user_passkey');
            if (!savedPasskey) {
                // No key saved yet. User must type it manually once.
                return false;
            }

            // 2. Check Hardware
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!hasHardware || !isEnrolled) return false;

            // 3. Prompt FaceID/Fingerprint
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock your Journal Vault',
                fallbackLabel: 'Enter Passkey',
            });

            if (result.success) {
                // 4. Success! Unlock using the saved passkey
                return await unlockVault(savedPasskey, false); // false = don't save again
            }
            return false;

        } catch (e) {
            console.log("Biometric Error", e);
            return false;
        }
    };

    // --- UPDATED: UNLOCK VAULT ---
    // We made this ASYNC so we can save to SecureStore
    const unlockVault = async (passkey, shouldSave = true) => {
        if (!userSalt) return false;

        // Derive Key
        const derivedKey = CryptoService.deriveKey(passkey, userSalt);
        setJournalKey(derivedKey);

        // Save to SecureStore for future FaceID usage
        if (shouldSave) {
            await SecureStore.setItemAsync('user_passkey', passkey);
        }
        return true;
    };

    const logout = async () => {
        setUserToken(null);
        setJournalKey(null);
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('userSalt');
        // Optional: Clear passkey on logout for extra security?
        // await SecureStore.deleteItemAsync('user_passkey');
    };

    return (
        <AuthContext.Provider value={{
            login, logout, unlockVault, unlockWithBiometrics,
            isLoading, userToken, userSalt, journalKey
        }}>
            {children}
        </AuthContext.Provider>
    );
};