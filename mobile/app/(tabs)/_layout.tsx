import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '@/src/lib/ui';

function TabIcon({ glyph }: { glyph: string }) {
  return <Text style={{ fontSize: 20 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.teal,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Find parking', tabBarIcon: () => <TabIcon glyph="🅿️" /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'My bookings', tabBarIcon: () => <TabIcon glyph="📋" /> }}
      />
      <Tabs.Screen
        name="alerts"
        options={{ title: 'Alerts', tabBarIcon: () => <TabIcon glyph="🔔" /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: () => <TabIcon glyph="👤" /> }}
      />
    </Tabs>
  );
}