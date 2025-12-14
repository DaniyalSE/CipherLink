/**
 * Auth Page Component
 * 
 * Handles user authentication including signup, login, and OTP verification.
 * Features terminal-style aesthetics with form validation.
 * 
 * SECURITY NOTES:
 * - Passwords are never stored locally
 * - OTP verification happens server-side
 * - Rate limiting is enforced for OTP resends
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Terminal, Lock, Mail, Eye, EyeOff, Shield, AlertTriangle } from 'lucide-react';
import { signup, login, verifyOTP, resendOTP } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface AuthFormData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface OTPFormData {
  otp: string;
}

const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState<string | null>(null);

  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors }, watch } = useForm<AuthFormData>();
  const { register: registerOTP, handleSubmit: handleOTPSubmit, formState: { errors: otpErrors }, reset: resetOTP } = useForm<OTPFormData>();

  const password = watch('password', '');

  // Password strength indicators
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  // OTP cooldown timer
  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCooldown]);

  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const response = await signup({ email: data.email, password: data.password });
        if (response.success) {
          setPendingEmail(data.email);
          setShowOTPModal(true);
          setOtpCooldown(60);
          // If mock OTP is provided (mock mode or no SMTP), store it and show it
          if (response.mock_otp) {
            setMockOtp(response.mock_otp);
            toast({
              title: 'OTP Generated',
              description: `Your verification code is: ${response.mock_otp}`,
              duration: 10000,
            });
          } else {
            setMockOtp(null);
            toast({
              title: 'OTP Sent',
              description: 'Check your email for the verification code.',
            });
          }
        }
      } else {
        const response = await login({ 
          email: data.email, 
          password: data.password,
          rememberMe: data.rememberMe,
        });
        if (response.success && response.user) {
          setUser(response.user);
          toast({
            title: 'Access Granted',
            description: 'Welcome back, ' + response.user.displayName,
          });
          navigate('/terminal');
        }
      }
    } catch (error: any) {
      // Extract error message from API response
      const errorMessage = error?.response?.data?.detail || error?.message || 'Invalid credentials or server error.';
      toast({
        title: mode === 'signup' ? 'Signup Failed' : 'Authentication Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onOTPSubmit = async (data: OTPFormData) => {
    setIsLoading(true);
    try {
      const response = await verifyOTP({ email: pendingEmail, otp: data.otp });
      if (response.success && response.user) {
        setUser(response.user);
        setShowOTPModal(false);
        resetOTP();
        toast({
          title: 'Verification Complete',
          description: 'Your account has been verified.',
        });
        navigate('/terminal');
      } else {
        toast({
          title: 'Invalid OTP',
          description: 'The code you entered is incorrect.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      // Extract error message from API response
      const errorMessage = error?.response?.data?.detail || error?.message || 'Please try again.';
      toast({
        title: 'Verification Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (otpCooldown > 0) return;
    
    try {
      const response = await resendOTP(pendingEmail);
      if (response.success) {
        setOtpCooldown(response.retry_after_seconds);
        // If mock OTP is provided, store it and show it
        if (response.mock_otp) {
          setMockOtp(response.mock_otp);
          toast({
            title: 'OTP Resent',
            description: `Your new verification code is: ${response.mock_otp}`,
            duration: 10000,
          });
        } else {
          toast({
            title: 'OTP Resent',
            description: 'Check your email for the new code.',
          });
        }
      }
    } catch (error: any) {
      // Extract error message from API response
      const errorMessage = error?.response?.data?.detail || error?.message || 'Please try again later.';
      toast({
        title: 'Failed to resend',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 matrix-bg">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Terminal window */}
        <div className="terminal-window">
          {/* Window header */}
          <div className="terminal-header">
            <div className="terminal-dot terminal-dot-red" />
            <div className="terminal-dot terminal-dot-yellow" />
            <div className="terminal-dot terminal-dot-green" />
            <span className="ml-4 text-muted-foreground text-sm">
              secure_terminal@auth:~
            </span>
          </div>

          {/* Window content */}
          <div className="p-6">
            {/* Logo and title */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Terminal className="w-10 h-10 text-primary glow-text" />
                <h1 className="text-2xl font-bold terminal-text glow-text">
                  SecureTerminal
                </h1>
              </div>
              <p className="text-muted-foreground text-sm">
                {mode === 'login' ? 'Access your secure terminal' : 'Initialize new terminal session'}
              </p>
            </div>

            {/* Mode tabs */}
            <div className="flex mb-6 border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === 'login' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                LOGIN
              </button>
              <button
                onClick={() => setMode('signup')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === 'signup' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                SIGNUP
              </button>
            </div>

            {/* Auth form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@terminal.io"
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                />
                {errors.email && (
                  <p className="text-destructive text-xs">{errors.email.message}</p>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="bg-input border-border text-foreground pr-10"
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 8,
                        message: 'Password must be at least 8 characters',
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-destructive text-xs">{errors.password.message}</p>
                )}
              </div>

              {/* Password strength (signup only) */}
              {mode === 'signup' && password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2 p-3 bg-secondary/50 rounded-lg text-xs"
                >
                  <p className="text-muted-foreground mb-2">Password requirements:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(passwordChecks).map(([key, valid]) => (
                      <div key={key} className={`flex items-center gap-1 ${valid ? 'text-primary' : 'text-muted-foreground'}`}>
                        <span>{valid ? '✓' : '○'}</span>
                        <span className="capitalize">{key === 'length' ? '8+ chars' : key}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Remember me (login only) */}
              {mode === 'login' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    className="rounded border-border bg-input"
                    {...register('rememberMe')}
                  />
                  <Label htmlFor="rememberMe" className="text-muted-foreground text-sm cursor-pointer">
                    Remember this terminal
                  </Label>
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full glow-border"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⟳</span>
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {mode === 'login' ? 'ACCESS TERMINAL' : 'INITIALIZE SESSION'}
                  </span>
                )}
              </Button>
            </form>

            {/* Security notice */}
            <div className="mt-6 p-3 bg-secondary/30 rounded-lg border border-border">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-terminal-amber" />
                <p>
                  <strong className="text-foreground">Security Notice:</strong> All connections are encrypted. 
                  Never share your credentials. OTP codes expire after 5 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mock mode indicator */}
        {import.meta.env.VITE_MOCK_MODE === 'true' && (
          <div className="mt-4 text-center text-xs text-terminal-amber">
            ⚠ MOCK MODE: No backend required. Any credentials will work.
          </div>
        )}
      </motion.div>

      {/* OTP Modal */}
      <AnimatePresence>
        {showOTPModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="terminal-window w-full max-w-sm"
            >
              <div className="terminal-header">
                <div className="terminal-dot terminal-dot-red" />
                <div className="terminal-dot terminal-dot-yellow" />
                <div className="terminal-dot terminal-dot-green" />
                <span className="ml-4 text-muted-foreground text-sm">
                  verify_otp@auth:~
                </span>
              </div>

              <div className="p-6">
                <h2 className="text-lg font-bold terminal-text mb-2">Verify Identity</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Enter the 6-digit code sent to <span className="text-primary">{pendingEmail}</span>
                </p>

                {/* Show mock OTP if available */}
                {mockOtp && (
                  <div className="mb-4 p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-lg">
                    <p className="text-xs text-terminal-green/80 mb-1">Development Mode - OTP Code:</p>
                    <p className="text-2xl font-mono font-bold text-terminal-green text-center tracking-widest">
                      {mockOtp}
                    </p>
                    <p className="text-xs text-terminal-green/60 mt-1 text-center">
                      (This code is shown because email is not configured)
                    </p>
                  </div>
                )}

                <form onSubmit={handleOTPSubmit(onOTPSubmit)} className="space-y-4">
                  <div>
                    <Input
                      type="text"
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-2xl tracking-widest bg-input border-border"
                      {...registerOTP('otp', {
                        required: 'OTP is required',
                        pattern: {
                          value: /^[0-9]{6}$/,
                          message: 'Enter a 6-digit code',
                        },
                      })}
                    />
                    {otpErrors.otp && (
                      <p className="text-destructive text-xs mt-1">{otpErrors.otp.message}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'VERIFY CODE'}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={otpCooldown > 0}
                      className={`text-sm ${
                        otpCooldown > 0 
                          ? 'text-muted-foreground cursor-not-allowed' 
                          : 'text-primary hover:underline'
                      }`}
                    >
                      {otpCooldown > 0 
                        ? `Resend available in ${otpCooldown}s` 
                        : 'Resend Code'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowOTPModal(false);
                      resetOTP();
                      setMockOtp(null);
                    }}
                    className="w-full text-muted-foreground text-sm hover:text-foreground"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;
