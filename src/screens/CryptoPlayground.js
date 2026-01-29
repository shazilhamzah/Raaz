import React, { useState } from 'react';
import 'react-native-get-random-values';
import { Text, View, TextInput, Button, ScrollView } from 'react-native';
import CryptoService from '../services/CryptoService';
import * as Crypto from 'expo-crypto'; // <--- NEW IMPORT

export default function App() {
  const [passkey, setPasskey] = useState('');
  const [secretText, setSecretText] = useState('');
  const [encryptedBlob, setEncryptedBlob] = useState('');

  const [decryptionKey, setDecryptionKey] = useState('');
  const [finalResult, setFinalResult] = useState('');

  // Hardcoded salt for testing (In real app, this comes from DB)
  const TEST_SALT = "UserUniqueSalt_12345";

  const handleEncrypt = () => {
    if (!passkey) return alert("Enter a passkey!");

    // 1. Generate Key
    const key = CryptoService.deriveKey(passkey, TEST_SALT);

    // 2. Encrypt
    const blob = CryptoService.encrypt(secretText, key);
    setEncryptedBlob(blob);
    setFinalResult(''); // Clear previous results
  };

  const handleDecrypt = () => {
    if (!decryptionKey) return alert("Enter a decryption passkey!");

    // 1. Generate Key (using the NEW input, which might be wrong)
    const key = CryptoService.deriveKey(decryptionKey, TEST_SALT);

    // 2. Decrypt
    const result = CryptoService.decrypt(encryptedBlob, key);
    setFinalResult(result);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-10 bg-primary">
      <Text className="text-3xl font-matanya mb-8 text-center text-highlight">The Gibberish Engine</Text>

      {/* SECTION 1: ENCRYPT */}
      <View className="bg-secondary p-5 rounded-2xl mb-6 border border-accent/20">
        <Text className="font-bold mb-2 text-highlight">1. Secret Message:</Text>
        <TextInput
          className="bg-primary/50 border border-accent/30 p-3 mb-4 rounded-xl text-white"
          placeholder="My secret dream..."
          placeholderTextColor="#BDE8F5"
          value={secretText}
          onChangeText={setSecretText}
        />
        <Text className="font-bold mb-2 text-highlight">2. Lock it with Passkey:</Text>
        <TextInput
          className="bg-primary/50 border border-accent/30 p-3 mb-6 rounded-xl text-white"
          placeholder="e.g. 1234"
          placeholderTextColor="#BDE8F5"
          value={passkey}
          onChangeText={setPasskey}
        />
        <Button title="ENCRYPT DATA" onPress={handleEncrypt} color="#4988C4" />
      </View>

      {/* SECTION 2: THE DATABASE VIEW */}
      {encryptedBlob ? (
        <View className="bg-secondary/50 p-5 rounded-2xl mb-6 border-l-4 border-orange-400">
          <Text className="font-bold mb-2 text-orange-200">💾 Stored in DB (Manager View):</Text>
          <Text className="font-mono text-highlight/70 text-[10px] leading-4">{encryptedBlob.substring(0, 100)}...</Text>
        </View>
      ) : null}

      {/* SECTION 3: DECRYPT */}
      <View className="bg-secondary p-5 rounded-2xl mb-6 border border-accent/20">
        <Text className="font-bold mb-2 text-highlight">3. Unlock (Try WRONG key):</Text>
        <TextInput
          className="bg-primary/50 border border-accent/30 p-3 mb-6 rounded-xl text-white"
          placeholder="Enter Passkey..."
          placeholderTextColor="#BDE8F5"
          value={decryptionKey}
          onChangeText={setDecryptionKey}
        />
        <Button title="DECRYPT" onPress={handleDecrypt} color="#22c55e" />
      </View>

      {/* SECTION 4: RESULT */}
      <View className="bg-secondary p-5 rounded-2xl mb-6 border border-accent/20">
        <Text className="font-bold mb-2 text-highlight">Result:</Text>
        <Text className="text-xl text-accent mt-2 font-bold">{finalResult || "Waiting..."}</Text>
      </View>

    </ScrollView>
  );
}
