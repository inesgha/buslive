import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http';

const login = vi.fn();
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ login }),
}));

const { LoginPage } = await import('./LoginPage');

describe('LoginPage', () => {
  it('affiche le refus de l’API (compte non modérateur)', async () => {
    login.mockRejectedValueOnce(new ApiError(403, 'Accès réservé aux modérateurs.'));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'usager@example.tn' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Accès réservé aux modérateurs.',
    );
    expect(login).toHaveBeenCalledWith('usager@example.tn', 'secret');
  });
});
