import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Animated, StyleSheet, Image, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen'; // <--- 1. Import This

// Context
import { AuthProvider, AuthContext } from './src/context/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import JournalScreen from './src/screens/JournalScreen';
import LogsScreen from './src/screens/LogsScreen';
import SetupVaultScreen from './src/screens/SetUpVaultScreen';
import LogDetailsScreen from './src/screens/LogDetailsScreen';

// 2. Prevent the native splash from hiding automatically
SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MyDarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0F2854',
  },
};

// --- MAIN TABS ---
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

// --- ROOT NAVIGATOR ---
function RootNavigator() {
  const { isLoading, userToken, isVaultInitialized } = useContext(AuthContext);

  if (isLoading) {
    return null; // We handle the loading view in the App component now
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
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

// --- MAIN APP COMPONENT ---
export default function App() {
  const [fontsLoaded] = useFonts({
    'Matanya': require('./assets/Matanya.otf'),
  });

  const [appIsReady, setAppIsReady] = useState(false);

  // Animation Values
  const fadeAnim = useState(new Animated.Value(1))[0];  // Opacity start 1
  const scaleAnim = useState(new Animated.Value(1))[0]; // Scale start 1

  useEffect(() => {
    async function prepare() {
      try {
        // Artificially delay for 2 seconds to show off the animation (Remove this in production if you want fast load)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the app we are ready to render
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && fontsLoaded) {
      // 3. Hide the Native static splash screen immediately
      await SplashScreen.hideAsync();

      // 4. Start our Custom Animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 800, // 0.8 seconds fade out
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.5, // Zoom in slightly while fading
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [appIsReady, fontsLoaded]);

  if (!appIsReady || !fontsLoaded) {
    return null; // Keep native splash visible
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={MyDarkTheme}>

          <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
            <RootNavigator />
          </View>

          {/* --- CUSTOM ANIMATED SPLASH OVERLAY --- */}
          {/* This sits ON TOP of your app and fades away */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: '#0F2854',
                opacity: fadeAnim,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
              }
            ]}
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              {/* REPLACE THIS ICON WITH YOUR APP LOGO */}
              <Ionicons name="journal" size={100} color="#BDE8F5" />
              <Text style={{
                fontFamily: 'Matanya',
                color: '#BDE8F5',
                fontSize: 48,
                marginTop: 20,
                letterSpacing: 4
              }}>
                RAAZ
              </Text>
            </Animated.View>
          </Animated.View>

        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}