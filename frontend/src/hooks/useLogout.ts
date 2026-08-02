import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

// Shared by every logout entry point (sidebar, mobile top bar, profile
// header) — previously each duplicated the same `await logout(); navigate(...)`
// with no error handling at all, so a failed logout request silently did
// nothing.
export function useLogout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showError } = useToast();

  return async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      showError(t('common.logoutError'));
    }
  };
}
