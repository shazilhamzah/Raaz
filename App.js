import React, { useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'; // <--- Import DefaultTheme
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

// Context
import { AuthProvider, AuthContext } from './src/context/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import JournalScreen from './src/screens/JournalScreen';
import LogsScreen from './src/screens/LogsScreen';
import SetupVaultScreen from './src/screens/SetUpVaultScreen';
import LogDetailsScreen from './src/screens/LogDetailsScreen'; 

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- 1. DEFINE THEME TO FIX WHITE FLASH ---
const MyDarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0F2854', // <--- This is the magic fix!
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0F2854',
          borderTopWidth: 1,
          borderTopColor: '#1C4D8D',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#BDE8F5',
        tabBarInactiveTintColor: '#4988C4',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Journal') {
            iconName = focused ? 'create' : 'create-outline';
          } else if (route.name === 'Logs') {
            iconName = focused ? 'file-tray-full' : 'file-tray-full-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Journal" component={JournalScreen} />
      <Tab.Screen name="Logs" component={LogsScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { isLoading, userToken, isVaultInitialized } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F2854' }}>
        <ActivityIndicator size="large" color="#4988C4" />
      </View>
    );
  }

  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        // --- 2. DOUBLE SAFEGUARD ---
        contentStyle: { backgroundColor: '#0F2854' }, 
        animation: 'slide_from_right' 
      }}
    >
      {userToken == null ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        !isVaultInitialized ? (
          <Stack.Screen name="SetupVault" component={SetupVaultScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="LogDetails" component={LogDetailsScreen} />
          </>
        )
      )}
    </Stack.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F2854' }}>
      <ActivityIndicator size="large" color="#4988C4" />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Matanya': require('./assets/Matanya.otf'),
  });

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setTimeout(() => setIsReady(true), 100);
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* --- 3. APPLY THEME HERE --- */}
        <NavigationContainer theme={MyDarkTheme} fallback={<LoadingScreen />}>
          {(!fontsLoaded || !isReady) ? (
            <LoadingScreen />
          ) : (
            <RootNavigator />
          )}
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}