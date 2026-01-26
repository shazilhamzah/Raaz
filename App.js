import 'react-native-get-random-values';
import React, { useContext } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native'; // Ensure you have this installed?
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthProvider, AuthContext } from './src/context/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import JournalScreen from './src/screens/JournalScreen';
import LogsScreen from './src/screens/LogsScreen';

// 1. Create the Tab Object
const Tab = createBottomTabNavigator();

// 2. The "Inside" App (Only accessible after login)
const AppTabs = () => {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={JournalScreen} />
      <Tab.Screen name="Logs" component={LogsScreen} />
    </Tab.Navigator>
  );
};

// 3. The Wrapper Logic
const AppNav = () => {
  const { isLoading, userToken } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // NOTE: NavigationContainer must wrap the whole thing!
  return (
    <NavigationContainer>
      {userToken ? <AppTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppNav />
    </AuthProvider>
  );
}