import React, { useContext } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'; // <--- NEW IMPORT
import { Ionicons } from '@expo/vector-icons'; // <--- Icons for the bar

// Context
import { AuthProvider, AuthContext } from './src/context/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import JournalScreen from './src/screens/JournalScreen';
import LogsScreen from './src/screens/LogsScreen';
import SetupVaultScreen from './src/screens/SetUpVaultScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator(); // <--- Create Tab Object

/**
 * 3. THE TAB NAVIGATOR (The "Lower Navbar")
 * This groups Journal and Logs together.
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false, // We hide the top header because screens have their own
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Journal') {
            iconName = focused ? 'create' : 'create-outline';
          } else if (route.name === 'Logs') {
            iconName = focused ? 'file-tray-full' : 'file-tray-full-outline';
          }

          // You can return any component that you like here!
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: 'black',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="Journal" component={JournalScreen} />
      <Tab.Screen name="Logs" component={LogsScreen} />
    </Tab.Navigator>
  );
}

/**
 * 1. THE NAVIGATION LOGIC
 */
function AppNavigator() {
  const { isLoading, userToken, isVaultInitialized } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {userToken == null ? (
          // --- NOT LOGGED IN ---
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // --- LOGGED IN ---
          !isVaultInitialized ? (
            // A. NO VAULT -> Force Setup
            <Stack.Screen name="SetupVault" component={SetupVaultScreen} />
          ) : (
            // B. VAULT READY -> SHOW TABS (Instead of single screens)
            <Stack.Screen name="MainTabs" component={MainTabs} />
          )
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { useFonts } from 'expo-font';

export default function App() {
  const [fontsLoaded] = useFonts({
    'Matanya': require('./assets/Matanya.otf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}