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

    // --- NEW STATE: Tracks if Biometrics are possible ---
    const [hasSavedPasskey, setHasSavedPasskey] = useState(false);

    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        setIsLoading(true);
        try {
            let token = await AsyncStorage.getItem('userToken');
            let salt = await AsyncStorage.getItem('userSalt');

            // Check if we have a saved passkey for biometrics
            const savedKey = await SecureStore.getItemAsync('user_passkey');
            setHasSavedPasskey(!!savedKey); // true if exists, false if null

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

    const unlockWithBiometrics = async () => {
        try {
            // 1. Check State First (Save time)
            if (!hasSavedPasskey) return false;

            // 2. Retrieve
            const savedPasskey = await SecureStore.getItemAsync('user_passkey');
            if (!savedPasskey) return false;

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!hasHardware || !isEnrolled) return false;

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock your Journal Vault',
                fallbackLabel: 'Enter Passkey',
            });

            if (result.success) {
                return await unlockVault(savedPasskey, false);
            }
            return false;

        } catch (e) {
            console.log("Biometric Error", e);
            return false;
        }
    };

    const unlockVault = async (passkey, shouldSave = true) => {
        if (!userSalt) return false;

        const derivedKey = CryptoService.deriveKey(passkey, userSalt);
        setJournalKey(derivedKey);

        if (shouldSave) {
            await SecureStore.setItemAsync('user_passkey', passkey);
            setHasSavedPasskey(true); // <--- Update State: Biometrics now enabled!
        }
        return true;
    };

    const logout = async () => {
        try {
            setUserToken(null);
            setJournalKey(null);
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('userSalt');

            // Clear Biometric Key
            await SecureStore.deleteItemAsync('user_passkey');
            setHasSavedPasskey(false); // <--- Update State: Biometrics disabled

        } catch (e) {
            console.log("Logout Error:", e);
        }
    };

    return (
        <AuthContext.Provider value={{
            login, logout, unlockVault, unlockWithBiometrics,
            isLoading, userToken, userSalt, journalKey,
            hasSavedPasskey // <--- Export this
        }}>
            {children}
        </AuthContext.Provider>
    );
};