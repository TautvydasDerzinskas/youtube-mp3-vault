import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Owns every piece of state and every handler for the login/register card —
 * the two form field sets, the shared error/tab/resend state, and the
 * submit handlers — so the page component can stay a plain layout.
 */
export function useLoginState() {
  const { t } = useTranslation();
  const { login, register, resendVerification } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [checkEmailAddress, setCheckEmailAddress] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Sign-in fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const selectTab = (value: number) => {
    setTab(value);
    setError(null);
    setNeedsVerification(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate('/playlists');
    } catch (err: unknown) {
      const data = (err as any)?.response?.data;
      setError(data?.error ?? t('auth.signInFailed'));
      setNeedsVerification(data?.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regPassword !== regConfirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      const { email } = await register(regEmail, regPassword, regName);
      setCheckEmailAddress(email);
    } catch (err: unknown) {
      setError((err as any)?.response?.data?.error ?? t('auth.registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (email: string) => {
    setResendState('sending');
    try {
      await resendVerification(email);
    } finally {
      setResendState('sent');
    }
  };

  const useDemoAccount = () => {
    setLoginEmail('demo@gmail.com');
    setLoginPassword('demo');
  };

  const backToSignIn = () => {
    setCheckEmailAddress(null);
    setResendState('idle');
    setTab(0);
  };

  return {
    tab, selectTab, loading, error, needsVerification, checkEmailAddress, resendState,
    loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    regName, setRegName, regEmail, setRegEmail, regPassword, setRegPassword, regConfirm, setRegConfirm,
    handleLogin, handleRegister, handleResend, useDemoAccount, backToSignIn,
  };
}
