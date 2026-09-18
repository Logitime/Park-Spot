import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_URL_KEY = 'api_url';
const DEFAULT_PORT = 4000;

export async function getApiUrl(): Promise<string> {
  const saved = await SecureStore.getItemAsync(API_URL_KEY);
  if (saved) return saved;

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${DEFAULT_PORT}`;
  }
  if (!__DEV__) {
    return 'https://park-spot-fawn.vercel.app';
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export async function setApiUrl(url: string) {
  await SecureStore.setItemAsync(API_URL_KEY, url.replace(/\/+$/, ''));
}

export async function clearApiUrl() {
  await SecureStore.deleteItemAsync(API_URL_KEY);
}