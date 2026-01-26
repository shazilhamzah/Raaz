import React, { useState } from 'react';
import 'react-native-get-random-values';
import { StyleSheet, Text, View, TextInput, Button, ScrollView } from 'react-native';
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
    setFinalResult(result);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>🔐 The Gibberish Engine</Text>

      {/* SECTION 1: ENCRYPT */}
      <View style={styles.card}>
        <Text style={styles.label}>1. Secret Message:</Text>
        <TextInput 
          style={styles.input} 
          placeholder="My secret dream..." 
          value={secretText}
          onChangeText={setSecretText}
        />
        <Text style={styles.label}>2. Lock it with Passkey:</Text>
        <TextInput 
          style={styles.input} 
          placeholder="e.g. 1234" 
          value={passkey}
          onChangeText={setPasskey}
        />
        <Button title="ENCRYPT DATA" onPress={handleEncrypt} />
      </View>

      {/* SECTION 2: THE DATABASE VIEW */}
      {encryptedBlob ? (
        <View style={[styles.card, { backgroundColor: '#e0e0e0' }]}>
          <Text style={styles.label}>💾 Stored in DB (What Manager sees):</Text>
          <Text style={styles.blob}>{encryptedBlob.substring(0, 50)}...</Text>
        </View>
      ) : null}

      {/* SECTION 3: DECRYPT */}
      <View style={styles.card}>
        <Text style={styles.label}>3. Try to Unlock (Enter WRONG key):</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Enter Passkey..." 
          value={decryptionKey}
          onChangeText={setDecryptionKey}
        />
        <Button title="DECRYPT" onPress={handleDecrypt} color="green" />
      </View>

      {/* SECTION 4: RESULT */}
      <View style={styles.card}>
        <Text style={styles.label}>Result:</Text>
        <Text style={styles.result}>{finalResult || "Waiting..."}</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 40, backgroundColor: '#f5f5f5', flexGrow: 1 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 20 },
  label: { fontWeight: 'bold', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5 },
  blob: { fontFamily: 'monospace', color: '#555', fontSize: 10 },
  result: { fontSize: 18, color: 'blue', marginTop: 10, fontWeight: 'bold' }
});