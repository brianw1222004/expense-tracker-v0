import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Inlined at build time by Expo (EXPO_PUBLIC_*); set them in .env. Must be
// read with static dot notation or the inlining doesn't happen.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Without config the app runs exactly as before: local-only, no auth, no sync.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Auth sessions persist in AsyncStorage rather than the expo-sqlite
// localStorage shim the Expo guide uses — AsyncStorage works unchanged on
// react-native-web (it maps to window.localStorage), and this app runs there.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // On web this picks up the session from email-confirmation links;
        // native has no URL to inspect.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

// Supabase's RN guidance: only refresh tokens while the app is foregrounded.
// On web the SDK manages its own refresh lifecycle.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
