import { useState, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/lib/auth';
import { getApiUrl, setApiUrl, clearApiUrl } from '@/src/lib/constants';
import { C } from '@/src/lib/ui';
import {
  Card,
  ErrorBox,
  PrimaryButton,
  ScreenSection,
} from '@/src/components/ui';

export default function AccountScreen() {
  const { user, signIn, signUp, signOut } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverSaved, setServerSaved] = useState(false);

  useEffect(() => {
    getApiUrl().then(setServerUrl);
  }, []);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(name.trim(), email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Account</Text>
          <Card>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{user.role}</Text>
            </View>
          </Card>

          <ServerSection
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            serverSaved={serverSaved}
            setServerSaved={setServerSaved}
          />

          <PrimaryButton label="Log out" tone="rose" onPress={() => signOut()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const input = (label: string, value: string, setValue: (v: string) => void, opts?: { secure?: boolean; autoCap?: boolean; keyboard?: 'email-address' }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        secureTextEntry={opts?.secure}
        autoCapitalize={opts?.autoCap === false ? 'none' : 'words'}
        keyboardType={opts?.keyboard}
        placeholderTextColor={C.muted}
        style={styles.input}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>
          <Text style={styles.subtitle}>
            Login uses the same accounts as the web app.
          </Text>

          <Card style={{ marginTop: 16 }}>
            {mode === 'register' &&
              input('Full name', name, setName)}
            {input(
              'Email',
              email,
              setEmail,
              { autoCap: false, keyboard: 'email-address' }
            )}
            {input('Password', password, setPassword, { secure: true })}

            <ErrorBox message={error} />
            <View style={{ height: 10 }} />

            <PrimaryButton
              label={mode === 'login' ? 'Log in' : 'Create account'}
              onPress={submit}
              loading={busy}
            />

            <View style={styles.switchRow}>
              <Text style={styles.small}>
                {mode === 'login'
                  ? 'New here?'
                  : 'Already registered?'}
              </Text>
              <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
                <Text style={styles.switchAction}>
                  {mode === 'login' ? 'Create an account' : 'Log in'}
                </Text>
              </Pressable>
            </View>
          </Card>

          <ServerSection
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            serverSaved={serverSaved}
            setServerSaved={setServerSaved}
          />

          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo accounts</Text>
            <Text style={styles.small}>user@parking.com / user123</Text>
            <Text style={styles.small}>admin@parking.com / admin123</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ServerSection({
  serverUrl,
  setServerUrl,
  serverSaved,
  setServerSaved,
}: {
  serverUrl: string;
  setServerUrl: (v: string) => void;
  serverSaved: boolean;
  setServerSaved: (v: boolean) => void;
}) {
  return (
    <ScreenSection title="Server Connection">
      <Card>
        <Text style={styles.small}>
          Backend URL (use your computer's LAN IP if testing on a physical phone)
        </Text>
        <TextInput
          value={serverUrl}
          onChangeText={(v) => {
            setServerUrl(v);
            setServerSaved(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.59:4000"
          placeholderTextColor={C.muted}
          style={styles.input}
        />
        {serverSaved && (
          <Text style={{ fontSize: 12, color: C.teal, marginTop: 6 }}>Saved!</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <PrimaryButton
            label="Save URL"
            onPress={async () => {
              await setApiUrl(serverUrl.trim());
              setServerSaved(true);
            }}
          />
          <PrimaryButton
            label="Reset"
            tone="outline"
            onPress={async () => {
              await clearApiUrl();
              const fresh = await getApiUrl();
              setServerUrl(fresh);
              setServerSaved(true);
            }}
          />
        </View>
      </Card>
    </ScreenSection>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: C.text },
  subtitle: { marginTop: 4, fontSize: 13, color: C.sub },
  name: { fontSize: 18, fontWeight: '700', color: C.text },
  email: { marginTop: 4, fontSize: 14, color: C.sub },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: C.tealBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: { color: C.tealDark, fontSize: 12, fontWeight: '700' },
  small: { fontSize: 12, color: C.sub, marginTop: 4 },
  code: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: C.tealDark,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  input: {
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    backgroundColor: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  switchAction: { fontSize: 13, fontWeight: '600', color: C.teal },
  demo: {
    marginTop: 24,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  demoTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
});