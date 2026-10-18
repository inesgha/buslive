import { RegisterSchema } from '@buslive/shared';
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
import { currentLocale } from '@/i18n';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setFormError(null);
    // La langue du compte = langue actuelle de l'app (servira aux notifications).
    const parsed = RegisterSchema.safeParse({
      displayName,
      email,
      password,
      locale: currentLocale(),
    });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(fromZodIssues(parsed.error.issues), t));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register(parsed.data);
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
        label={t('auth.displayName')}
        value={displayName}
        onChangeText={setDisplayName}
        error={fieldErrors.displayName}
        autoComplete="name"
        textContentType="name"
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void onSubmit()}
      />
      {formError ? (
        <AppText color="notCame" accessibilityLiveRegion="polite">
          {formError}
        </AppText>
      ) : null}
      <Button
        label={t('auth.submitRegister')}
        onPress={() => void onSubmit()}
        loading={submitting}
      />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/auth/login')}>
        <AppText weight="medium" style={{ textAlign: 'center' }}>
          {t('auth.haveAccount')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
