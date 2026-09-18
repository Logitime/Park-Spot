import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants as any).executionEnvironment === 'storeClient';

let NotificationsModule: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (Platform.OS === 'web' || isExpoGo) return null;
  if (NotificationsModule) return NotificationsModule;
  try {
    const mod = await import('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    NotificationsModule = mod;
    return mod;
  } catch {
    return null;
  }
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

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
  } catch {
    if (__DEV__) {
      console.log('[push] Push notifications not configured or not supported in current client');
    }
    return null;
  }
}

export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    await api.del('/api/push-tokens', {});
  } catch {
    // token may already be gone
  }
}