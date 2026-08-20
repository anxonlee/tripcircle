import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseOtpInput } from '../lib/otpInput';
import { serverMessage } from '../lib/serverError';
import { useAuthStore } from '../store/useAuthStore';
import { colors } from '../theme/colors';

/**
 * Signing in, which in this app means proving you can read an email.
 *
 * A code rather than a password: the app never handles one, so it cannot
 * store or leak one. A code rather than a magic link, because a link has to
 * travel from a mail app back into a React Native build, and the plumbing
 * that makes that work is a lot of machinery for a beta.
 *
 * The copy leads with what an account is for. Nobody wants an account; they
 * want the list, and the screen should say which one it is asking about.
 */
export function SignIn() {
  const sendCode = useAuthStore((s) => s.sendCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setSent(true);
    } catch (e) {
      setError(serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch (e) {
      setError(serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Plan with someone else</Text>
      <Text style={styles.body}>
        A shared list needs an account so the other person can see it. Your
        diary stays on this phone either way — it is never uploaded, with or
        without an account.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!busy}
      />

      {sent && (
        <>
          {/*
            Both shapes are named because either can arrive: the server
            sends a code or a link depending on a template this app does
            not control, and a screen that only mentioned one would look
            broken to whoever got the other.
          */}
          <Text style={styles.sentNote}>
            Check {email.trim()}. Enter the six-digit code, or paste the
            sign-in link if that is what you were sent.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={setCode}
            // Not the number pad: a link has to be pasteable here too.
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="oneTimeCode"
            editable={!busy}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.primary, busy && styles.primaryOff]}
        disabled={
          busy || (sent ? parseOtpInput(code) === null : !email.includes('@'))
        }
        onPress={sent ? verify : send}
      >
        <Text style={styles.primaryText}>
          {busy ? 'One moment…' : sent ? 'Sign in' : 'Email me a code'}
        </Text>
      </Pressable>

      {sent && !busy && (
        <Pressable onPress={() => setSent(false)}>
          <Text style={styles.link}>Use a different address</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  input: {
    height: 44,
    borderRadius: 13,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceInput,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sentNote: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  error: { fontSize: 12, color: colors.warning, lineHeight: 17 },
  primary: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryOff: { opacity: 0.6 },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  link: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
