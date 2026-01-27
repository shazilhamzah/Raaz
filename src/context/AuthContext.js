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
    const [journalKey, setJournalKey] = useState(null);
    const [hasSavedPasskey, setHasSavedPasskey] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => { checkLoginStatus(); }, []);

    const checkLoginStatus = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const salt = await AsyncStorage.getItem('userSalt');
            const savedPasskey = await SecureStore.getItemAsync('user_passkey');

            setHasSavedPasskey(!!savedPasskey);

            if (token) {
                setUserToken(token);
                setUserSalt(salt);
            }
        } catch (e) { console.log("Init Error:", e); }
        setIsLoading(false);
    };

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            // Trim password to prevent "invisible space" errors
            const cleanPassword = password.trim();

            const res = await api.post('/auth/login', { email, password: cleanPassword });
            const { token, encryption_salt } = res.data;

            console.log("LOGIN: Salt received:", encryption_salt);

            // 1. Derive Key
            const derivedKey = CryptoService.deriveKey(cleanPassword, encryption_salt);

            // 2. Create Canary
            const canary = CryptoService.encrypt("VALID", derivedKey);
            console.log("LOGIN: Canary created:", canary);

            await AsyncStorage.setItem('auth_canary', canary);
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('userSalt', encryption_salt);

            setUserToken(token);
            setUserSalt(encryption_salt);
            setJournalKey(derivedKey);

            // Reset biometrics
            await SecureStore.deleteItemAsync('user_passkey');
            setHasSavedPasskey(false);

        } catch (e) {
            console.log("Login Error", e);
            alert("Login Failed");
        } finally {
            setIsLoading(false);
        }
    };

    const unlockVault = async (passkey, shouldSave = true) => {
        try {
            const cleanPasskey = passkey.trim(); // FIX: Remove trailing spaces

            // SAFETY: Ensure we have the salt
            let currentSalt = userSalt;
            if (!currentSalt) {
                console.log("UNLOCK: userSalt missing in state, fetching from storage...");
                currentSalt = await AsyncStorage.getItem('userSalt');
                if (currentSalt) setUserSalt(currentSalt);
                else {
                    console.log("UNLOCK: FATAL - No salt found anywhere.");
                    return false;
                }
            }

            // 1. Derive
            const derivedKey = CryptoService.deriveKey(cleanPasskey, currentSalt);

            // 2. Check Canary
            const storedCanary = await AsyncStorage.getItem('auth_canary');

            if (storedCanary) {
                const check = CryptoService.decrypt(storedCanary, derivedKey);
                // console.log("UNLOCK Check:", check); // Uncomment to debug

                if (check !== "VALID") {
                    console.log("UNLOCK: Canary check failed. (Derived key didn't match)");
                    return false;
                }
            } else {
                console.log("UNLOCK: Warning - No canary found. Allowing (Legacy Mode).");
            }

            // 3. Success
            setJournalKey(derivedKey);

            if (shouldSave) {
                await SecureStore.setItemAsync('user_passkey', cleanPasskey);
                setHasSavedPasskey(true);
            }
            return true;

        } catch (e) {
            console.log("Unlock Error:", e);
            return false;
        }
    };

    const unlockWithBiometrics = async () => {
        try {
            if (!hasSavedPasskey) return false;
            const savedPasskey = await SecureStore.getItemAsync('user_passkey');
            if (!savedPasskey) return false;

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) return false;

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Vault',
                fallbackLabel: 'Enter Passkey',
            });

            if (result.success) {
                return await unlockVault(savedPasskey, false);
            }
            return false;
        } catch (e) { return false; }
    };

    const logout = async () => {
        try {
            setUserToken(null);
            setJournalKey(null);
            await AsyncStorage.removeItem('userToken');
            // await AsyncStorage.removeItem('userSalt'); // Optional: Keep salt to prevent total lockout if offline? No, secure it.
            await AsyncStorage.removeItem('userSalt');
            await AsyncStorage.removeItem('auth_canary');
            await SecureStore.deleteItemAsync('user_passkey');
            setHasSavedPasskey(false);
        } catch (e) { console.log("Logout Error:", e); }
    };

    return (
        <AuthContext.Provider value={{
            login, logout, unlockVault, unlockWithBiometrics,
            isLoading, userToken, userSalt, journalKey, hasSavedPasskey
        }}>
            {children}
        </AuthContext.Provider>
    );
};