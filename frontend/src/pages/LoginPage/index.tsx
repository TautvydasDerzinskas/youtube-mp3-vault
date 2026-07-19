import { Box, Card, CardContent, Tab, Tabs } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useLoginState } from './hooks/useLoginState';
import { Branding } from './Branding';
import { CheckEmailPanel } from './CheckEmailPanel';
import { AuthErrorAlert } from './AuthErrorAlert';
import { SignInForm } from './SignInForm';
import { RegisterForm } from './RegisterForm';

export default function LoginPage() {
  const { t } = useTranslation();
  const {
    tab, selectTab, loading, error, needsVerification, checkEmailAddress, resendState,
    loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    regName, setRegName, regEmail, setRegEmail, regPassword, setRegPassword, regConfirm, setRegConfirm,
    handleLogin, handleRegister, handleResend, useDemoAccount, backToSignIn,
  } = useLoginState();

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'background.default', p: 2,
    }}>
      <Card sx={{ width: '100%', maxWidth: 420, p: 1 }}>
        <CardContent>
          <Branding />

          {checkEmailAddress ? (
            <CheckEmailPanel
              email={checkEmailAddress}
              resendState={resendState}
              onResend={() => handleResend(checkEmailAddress)}
              onBackToSignIn={backToSignIn}
            />
          ) : (
            <>
              <Tabs value={tab} onChange={(_, v: number) => selectTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
                <Tab label={t('auth.signIn')} />
                <Tab label={t('auth.register')} />
              </Tabs>

              <AuthErrorAlert
                error={error}
                needsVerification={needsVerification}
                resendState={resendState}
                onResend={() => handleResend(loginEmail)}
              />

              {tab === 0 && (
                <SignInForm
                  email={loginEmail}
                  password={loginPassword}
                  onEmailChange={setLoginEmail}
                  onPasswordChange={setLoginPassword}
                  loading={loading}
                  onSubmit={handleLogin}
                  onUseDemoAccount={useDemoAccount}
                />
              )}

              {tab === 1 && (
                <RegisterForm
                  name={regName}
                  email={regEmail}
                  password={regPassword}
                  confirm={regConfirm}
                  onNameChange={setRegName}
                  onEmailChange={setRegEmail}
                  onPasswordChange={setRegPassword}
                  onConfirmChange={setRegConfirm}
                  loading={loading}
                  onSubmit={handleRegister}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
