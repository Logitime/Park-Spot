import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await api.put('/api/push-tokens', {
      token: token.data,
      platform: Platform.OS,
    });
    return token.data;
  } catch (error: any) {
    if (__DEV__) {
      // Only log brief message in dev if Firebase isn't set up yet
      console.log('[push] Push notifications not configured (requires google-services.json)');
    }
    return null;
  }

}

export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await api.del('/api/push-tokens', {});
  } catch {
    // token may already be gone
  }
}