import { useEffect } from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';

import SignInScreen from './screens/SignInScreen';
import ExploreScreen from './screens/ExploreScreen';
import RestaurantsScreen from './screens/RestaurantsScreen';
import PassportScreen from './screens/PassportScreen';

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

export type ExploreStackParamList = {
  ExploreHome: undefined;
  Restaurants: { dishId: string; dishName: string; cityName: string; cityCountry: string };
};

const Tab = createBottomTabNavigator();
const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();

function ExploreNavigator() {
  return (
    <ExploreStack.Navigator>
      <ExploreStack.Screen name="ExploreHome" component={ExploreScreen} options={{ title: 'Explore' }} />
      <ExploreStack.Screen name="Restaurants" component={RestaurantsScreen} options={({ route }) => ({ title: route.params.dishName })} />
    </ExploreStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Explore: 'search',
            Passport: 'book',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Explore" component={ExploreNavigator} />
      <Tab.Screen name="Passport" component={PassportScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return isSignedIn ? <AppTabs /> : <SignInScreen />;
}

const linking = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: {},
  },
};

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <NavigationContainer linking={linking}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </ClerkProvider>
  );
}
