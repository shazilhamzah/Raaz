import React, { useState, useContext } from 'react';
import { View, Text, TextInput, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, register, isLoading } = useContext(AuthContext);

  const handleAction = () => {
    if (!email.trim() || !password.trim()) {
      alert("Please enter email and password");
      return;
    }

    if (isLogin) {
      login(email, password);
    } else {
      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        alert("Password must be at least 6 characters");
        return;
      }
      register(email, password);
    }
  };

  return (
    <View className="flex-1 justify-center p-8 bg-primary">
      <View className="items-center mb-6">
        <View className="bg-secondary/30 p-4 rounded-full border border-accent/20 mb-4 shadow-lg shadow-accent/10">
          <Ionicons name={isLogin ? "log-in-outline" : "person-add-outline"} size={48} color="#BDE8F5" />
        </View>
        <Text className="text-7xl text-highlight font-matanya text-center tracking-wider">
          {isLogin ? "LOG IN" : "SIGN UP"}
        </Text>
      </View>

      <View className="w-full bg-secondary p-10 rounded-2xl shadow-xl bg-opacity-80 border border-accent">
        <View className="mb-6">
          <View className="flex-row items-center bg-primary/30 border border-accent/50 rounded-2xl px-4 py-1">
            <Ionicons name="mail-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
            <TextInput
              className="flex-1 text-white text-lg py-4 placeholder:text-highlight/50"
              placeholder="Email Address"
              placeholderTextColor="rgba(189, 232, 245, 0.5)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        </View>

        <View className="mb-6">
          <View className="flex-row items-center bg-primary/30 border border-accent/50 rounded-2xl px-4 py-1">
            <Ionicons name="lock-closed-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
            <TextInput
              className="flex-1 text-white text-lg py-4 placeholder:text-highlight/50"
              placeholder="Password"
              placeholderTextColor="rgba(189, 232, 245, 0.5)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={24} color="#BDE8F5" />
            </TouchableOpacity>
          </View>
        </View>

        {!isLogin && (
          <View className="mb-8">
            <View className="flex-row items-center bg-primary/30 border border-accent/50 rounded-2xl px-4 py-1">
              <Ionicons name="shield-checkmark-outline" size={24} color="#BDE8F5" style={{ marginRight: 10 }} />
              <TextInput
                className="flex-1 text-white text-lg py-4 placeholder:text-highlight/50"
                placeholder="Confirm Password"
                placeholderTextColor="rgba(189, 232, 245, 0.5)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={24} color="#BDE8F5" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color="#4988C4" />
        ) : (
          <TouchableOpacity
            className="bg-accent p-4 rounded-2xl items-center shadow-lg shadow-black/30 flex-row justify-center space-x-2"
            onPress={handleAction}
          >
            <Ionicons name={isLogin ? "key-outline" : "create-outline"} size={24} color="#0F2854" style={{ marginRight: 8 }} />
            <Text className="text-white font-bold text-xl uppercase tracking-wider">
              {isLogin ? "Unlock Journal" : "Create Account"}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="mt-6 flex-row justify-center items-center">
          <Text className="text-highlight text-center font-bold">
            {isLogin ? "New here? Create Account" : "Already have an account? Log In"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#BDE8F5" style={{ marginLeft: 5 }} />
        </TouchableOpacity>

      </View>

      <Text className="mt-8 text-highlight/60 text-center text-sm">
        Note: This password enters the app. Your Passkey unlocks the data later.
      </Text>
    </View>
  );
}