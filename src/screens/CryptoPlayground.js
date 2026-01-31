import React, { useState } from 'react';
import 'react-native-get-random-values';
import { Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CryptoService from '../services/CryptoService';


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
    // Handle object return {text, success} vs string
    const decryptedText = (typeof result === 'object' && result.text) ? result.text : result;
    setFinalResult(decryptedText);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-8 bg-primary">
      <View className="items-center mb-8">
        <View className="bg-secondary/30 p-4 rounded-full border border-accent/20 mb-4">
          <Ionicons name="code-slash-outline" size={48} color="#BDE8F5" />
        </View>
        <Text className="text-3xl font-matanya text-center text-highlight tracking-widest uppercase">The Gibberish Engine</Text>
      </View>

      {/* SECTION 1: ENCRYPT */}
      <View className="bg-secondary/20 p-6 rounded-3xl mb-6 border border-accent/20">
        <View className="flex-row items-center mb-4 border-b border-accent/10 pb-2">
          <Ionicons name="lock-closed-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
          <Text className="font-bold text-lg text-highlight">Encryption Lab</Text>
        </View>

        <Text className="text-xs font-bold text-accent/60 mb-2 uppercase tracking-wider">1. Secret Message</Text>
        <TextInput
          className="bg-primary/50 border border-accent/30 p-4 mb-4 rounded-xl text-white font-semibold"
          placeholder="My secret dream..."
          placeholderTextColor="rgba(189, 232, 245, 0.3)"
          value={secretText}
          onChangeText={setSecretText}
        />

        <Text className="text-xs font-bold text-accent/60 mb-2 uppercase tracking-wider">2. Lock with Passkey</Text>
        <View className="flex-row items-center bg-primary/50 border border-accent/30 rounded-xl px-4 mb-6">
          <Ionicons name="key-outline" size={20} color="#BDE8F5" style={{ marginRight: 10 }} />
          <TextInput
            className="flex-1 py-4 text-white font-mono"
            placeholder="e.g. 1234"
            placeholderTextColor="rgba(189, 232, 245, 0.3)"
            value={passkey}
            onChangeText={setPasskey}
            keyboardType="default"
          />
        </View>

        <TouchableOpacity
          className="bg-accent p-4 rounded-xl items-center shadow-lg active:bg-accent/80"
          onPress={handleEncrypt}
        >
          <Text className="text-primary font-bold uppercase tracking-wider">🔒 Encrypt Data</Text>
        </TouchableOpacity>
      </View>

      {/* SECTION 2: THE DATABASE VIEW */}
      {encryptedBlob ? (
        <View className="bg-orange-500/10 p-5 rounded-2xl mb-6 border-l-4 border-orange-500">
          <View className="flex-row items-center mb-2">
            <Ionicons name="server-outline" size={20} color="#FDBA74" style={{ marginRight: 8 }} />
            <Text className="font-bold text-orange-200">Stored in Database (Raw)</Text>
          </View>
          <Text className="font-mono text-orange-200/70 text-[10px] leading-4 bg-black/20 p-2 rounded-lg">{encryptedBlob.substring(0, 150)}...</Text>
        </View>
      ) : null}

      {/* SECTION 3: DECRYPT */}
      <View className="bg-secondary/20 p-6 rounded-3xl mb-6 border border-accent/20">
        <View className="flex-row items-center mb-4 border-b border-accent/10 pb-2">
          <Ionicons name="key-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
          <Text className="font-bold text-lg text-highlight">Decryption Lab</Text>
        </View>

        <Text className="text-xs font-bold text-accent/60 mb-2 uppercase tracking-wider">3. Unlock (Try WRONG key)</Text>
        <TextInput
          className="bg-primary/50 border border-accent/30 p-4 mb-6 rounded-xl text-white font-mono"
          placeholder="Enter Passkey..."
          placeholderTextColor="rgba(189, 232, 245, 0.3)"
          value={decryptionKey}
          onChangeText={setDecryptionKey}
          keyboardType="default"
        />

        <TouchableOpacity
          className="bg-green-500/80 p-4 rounded-xl items-center shadow-lg active:bg-green-600 border border-green-400/30"
          onPress={handleDecrypt}
        >
          <View className="flex-row items-center">
            <Ionicons name="open-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text className="text-white font-bold uppercase tracking-wider">Decrypt</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* SECTION 4: RESULT */}
      <View className="bg-secondary p-6 rounded-3xl mb-6 border border-accent/20">
        <Text className="font-bold mb-2 text-highlight uppercase tracking-wider text-xs">Decryption Result</Text>
        <View className="bg-primary/40 p-4 rounded-xl border border-accent/10 min-h-[60px] justify-center">
          <Text className="text-xl text-white font-bold text-center">
            {finalResult || <Text className="text-accent/30 italic">Waiting for input...</Text>}
          </Text>
        </View>
      </View>

    </ScrollView>
  );
}
