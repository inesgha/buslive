import { LoginSchema } from '@buslive/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { ApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import {
  authErrorMessage,
  type FieldErrors,
  fromZodIssues,
  toFieldErrors,
} from '@/auth/errorMessages';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setFormError(null);
    // Même schéma que l'API : les erreurs évidentes sont signalées sans appel réseau.
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(fromZodIssues(parsed.error.issues), t));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data);
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.issues.length > 0) {
        setFieldErrors(toFieldErrors(error.issues, t));
      } else {
        setFormError(authErrorMessage(error, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void onSubmit()}
      />
      {formError ? (
        <AppText color="notCame" accessibilityLiveRegion="polite">
          {formError}
        </AppText>
      ) : null}
      <Button label={t('auth.submitLogin')} onPress={() => void onSubmit()} loading={submitting} />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/auth/register')}>
        <AppText weight="medium" style={{ textAlign: 'center' }}>
          {t('auth.noAccount')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
