import { TunisianPhoneSchema, type UserProfile } from '@buslive/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ApiError } from '@/api/errors';
import { updateProfile } from '@/api/me';
import { session } from '@/auth/session';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';

/**
 * Profil → Téléphone : seulement pour le covoiturage. Il n'est montré qu'à la
 * personne dont on accepte la demande (ou qui accepte la sienne).
 */
export function PhoneCard({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(user.phone ?? '');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const save = useMutation({
    mutationFn: (phone: string | null) => updateProfile({ phone }),
    onSuccess: async (profile) => {
      await session.updateProfile(profile);
      setValue(profile.phone ?? '');
      setMessage({ text: t('phone.saved'), error: false });
    },
    onError: (error) =>
      setMessage({
        text:
          error instanceof ApiError && error.status === 409 ? t('phone.taken') : t('rides.error'),
        error: true,
      }),
  });

  function onSave() {
    // Même validation que l'API (« 22 123 456 », « 0021622123456 »… → « +21622123456 »).
    const parsed = TunisianPhoneSchema.safeParse(value);
    if (!parsed.success) {
      setMessage({ text: t('phone.invalid'), error: true });
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('phone.title')}</AppText>
      <AppText variant="caption" color="textMuted">
        {t('phone.hint')}
      </AppText>
      <TextField
        label={t('phone.title')}
        value={value}
        onChangeText={setValue}
        placeholder={t('phone.placeholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      {message ? (
        <AppText variant="caption" color={message.error ? 'notCame' : 'live'}>
          {message.text}
        </AppText>
      ) : null}
      <Button label={t('phone.save')} loading={save.isPending} onPress={onSave} />
      {user.phone ? (
        <Button label={t('phone.remove')} variant="secondary" onPress={() => save.mutate(null)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
});
