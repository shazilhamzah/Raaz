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
    const [userEmail, setUserEmail] = useState(null); // <--- NEW: Track Email
    const [journalKey, setJournalKey] = useState(null);
    const [hasSavedPasskey, setHasSavedPasskey] = useState(false);
    const [isVaultInitialized, setIsVaultInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => { checkLoginStatus(); }, []);

    const checkLoginStatus = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const salt = await AsyncStorage.getItem('userSalt');
            const email = await AsyncStorage.getItem('userEmail'); // <--- Load Email
            const savedPasskey = await SecureStore.getItemAsync('user_passkey');
            const canary = await AsyncStorage.getItem('auth_canary');

            setHasSavedPasskey(!!savedPasskey);
            setIsVaultInitialized(!!canary);

            if (token) {
                setUserToken(token);
                setUserSalt(salt);
                setUserEmail(email); // <--- Set Email
            }
        } catch (e) { console.log("Init Error:", e); }
        setIsLoading(false);
    };

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const cleanPassword = password.trim();
            const res = await api.post('/auth/login', { email, password: cleanPassword });
            const { token, encryption_salt, canary } = res.data;

            setUserToken(token);
            setUserSalt(encryption_salt);
            setUserEmail(email); // <--- Save Email State

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('userSalt', encryption_salt);
            await AsyncStorage.setItem('userEmail', email); // <--- Persist Email

            if (canary) {
                await AsyncStorage.setItem('auth_canary', canary);
                setIsVaultInitialized(true);
            } else {
                setIsVaultInitialized(false);
            }

        } catch (e) {
            console.error("Login Error Details:", e);
            const msg = e.response?.data?.msg || e.message || "Login Failed";
            alert(`Login Error: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (email, password) => {
        setIsLoading(true);
        try {
            const cleanPassword = password.trim();
            const res = await api.post('/auth/register', { email, password: cleanPassword });
            const { token, encryption_salt } = res.data;

            setUserToken(token);
            setUserSalt(encryption_salt);
            setUserEmail(email); // <--- Save Email

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('userSalt', encryption_salt);
            await AsyncStorage.setItem('userEmail', email); // <--- Persist Email

            setIsVaultInitialized(false);
            alert("Account created successfully! Please set up your vault passkey.");
        } catch (e) {
            console.error("Register Error Details:", e);
            const msg = e.response?.data?.msg || e.message || "Registration Failed";
            alert(`Registration Error: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ... setupVault, unlockVault, getRawKey, unlockWithBiometrics remain exactly the same ...
    const setupVault = async (newPasskey) => {
        try {
            if (!userSalt) return false;
            const clean = newPasskey.trim();

            const derivedKeyHex = CryptoService.deriveKey(clean, userSalt);
            const canary = CryptoService.encrypt("VALID", derivedKeyHex);

            await AsyncStorage.setItem('auth_canary', canary);
            await api.post('/auth/canary', { canary }, {
                headers: { 'x-auth-token': userToken }
            });

            setJournalKey(derivedKeyHex);
            setIsVaultInitialized(true);
            return true;
        } catch (e) { return false; }
    };

    const unlockVault = async (passkey, shouldSave = true) => {
        try {
            const cleanPasskey = passkey.trim();
            const currentSalt = await AsyncStorage.getItem('userSalt');
            if (!currentSalt) return false;

            const derivedKeyHex = CryptoService.deriveKey(cleanPasskey, currentSalt);
            const storedCanary = await AsyncStorage.getItem('auth_canary');

            if (!storedCanary) return false;

            const check = CryptoService.decrypt(storedCanary, derivedKeyHex);
            const checkText = (typeof check === 'object' && check.text) ? check.text : check;

            if (checkText !== "VALID") return false;

            setJournalKey(derivedKeyHex);

            if (shouldSave) {
                await SecureStore.setItemAsync('user_passkey', cleanPasskey);
                setHasSavedPasskey(true);
            }
            return derivedKeyHex;

        } catch (e) { return false; }
    };

    const getRawKey = (passkey) => {
        if (!userSalt) return null;
        return CryptoService.deriveKey(passkey.trim(), userSalt);
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
            if (result.success) return await unlockVault(savedPasskey, false);
            return false;
        } catch (e) { return false; }
    };

    const logout = async () => {
        try {
            setUserToken(null);
            setJournalKey(null);
            setUserEmail(null); // <--- Clear Email State

            await AsyncStorage.multiRemove(['userToken', 'userSalt', 'auth_canary', 'userEmail']); // <--- Remove Email from Storage
            await SecureStore.deleteItemAsync('user_passkey');

            setHasSavedPasskey(false);
            setIsVaultInitialized(false);
        } catch (e) { console.log("Logout Error:", e); }
    };

    return (
        <AuthContext.Provider value={{
            login, register, logout, unlockVault, unlockWithBiometrics, setupVault, getRawKey,
            isLoading, userToken, userSalt, journalKey, hasSavedPasskey, isVaultInitialized, userEmail // <--- Export userEmail
        }}>
            {children}
        </AuthContext.Provider>
    );
};