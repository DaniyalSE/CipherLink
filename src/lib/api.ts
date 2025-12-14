/**
 * API Client Configuration
 * 
 * This module provides an axios instance configured for the SecureTerminal API.
 * It handles token management, request/response interceptors, and mock mode.
 * 
 * SECURITY NOTES:
 * - Tokens should ideally be stored in httpOnly cookies (backend responsibility)
 * - This client stores tokens in memory only for demo purposes
 * - All production API calls should be over HTTPS
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Check if we're in mock mode
const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// In-memory token storage (for demo - prefer httpOnly cookies in production)
let accessToken: string | null = null;

/**
 * Set the access token for API requests
 * NOTE: In production, tokens should be in httpOnly cookies
 */
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

/**
 * Get the current access token
 */
export const getAccessToken = (): string | null => accessToken;

/**
 * Clear authentication state
 */
export const clearAuth = (): void => {
  accessToken = null;
  sessionStorage.removeItem('user');
};

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies in requests
});

// Request interceptor - adds auth token
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      clearAuth();
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

// ============================================
// MOCK API RESPONSES (for demo mode)
// ============================================

interface MockUser {
  id: string;
  email: string;
  displayName: string;
  online: boolean;
}

const mockUsers: MockUser[] = [
  { id: '1', email: 'alice@terminal.io', displayName: 'alice', online: true },
  { id: '2', email: 'bob@terminal.io', displayName: 'bob', online: true },
  { id: '3', email: 'charlie@terminal.io', displayName: 'charlie', online: false },
  { id: '4', email: 'daemon@terminal.io', displayName: 'daemon', online: true },
];

const mockDelay = (ms: number = 500): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// AUTH API ENDPOINTS
// ============================================

export interface SignupRequest {
  email: string;
  password: string;
}

export interface SignupResponse {
  success: boolean;
  next: 'verify';
  message?: string;
  mock_otp?: string;
}

export interface VerifyOTPRequest {
  email: string;
  otp: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface ResendOTPResponse {
  success: boolean;
  retry_after_seconds: number;
  mock_otp?: string;
}

export interface KeypairResponse {
  publicKeyFingerprint: string;
  publicKeyPEM: string;
}

export interface ContactRecord {
  linkId: string;
  peer: {
    id: string;
    email: string;
    displayName: string;
  };
  status: string;
  createdAt: string;
  online: boolean;
  sessionKeyBase64: string;
  sessionKeyFingerprint: string;
}

export interface KdcSessionLifecycle {
  generated: string | null;
  distributed: string | null;
  expires: string | null;
  status: string;
}

export interface KdcSessionResponse {
  kdcSessionId: string;
  encryptedKeyForSender: string;
  encryptedKeyForReceiver: string;
  keyFingerprint: string;
  lifecycle: KdcSessionLifecycle;
}

export interface KeyEventRecord {
  id: string;
  source: string;
  eventType: string;
  kdcSessionId?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SystemSecurityStatus {
  activeSessions: number;
  activeKDCSessions: number;
  recentKeyRotations: number;
  forwardSecrecyActive: boolean;
  uptime: number;
}

export interface MessageHistoryRecord {
  id: string;
  direction: 'inbound' | 'outbound';
  peerId: string;
  peerDisplay?: string | null;
  ciphertextBase64: string;
  ivBase64: string;
  signatureStatus?: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface MessageHistoryResponse {
  count: number;
  records: MessageHistoryRecord[];
}

export interface PfsStartResponse {
  pfsSessionId: string;
  serverEphemeralPublicKey: string;
}

export interface PfsCompleteResponse {
  pfsSessionId: string;
  sessionKeyBase64: string;
}

/**
 * Sign up a new user
 * Backend will send OTP to email
 */
export const signup = async (data: SignupRequest): Promise<SignupResponse> => {
  if (isMockMode) {
    await mockDelay();
    console.log('[MOCK API] Signup request:', data.email);
    return { success: true, next: 'verify', message: 'OTP sent to email' };
  }
  const response = await api.post<SignupResponse>('/auth/signup', data);
  return response.data;
};

/**
 * Verify OTP code sent to email
 */
export const verifyOTP = async (data: VerifyOTPRequest): Promise<VerifyOTPResponse> => {
  if (isMockMode) {
    await mockDelay();
    // Accept any 6-digit OTP in mock mode
    if (data.otp.length === 6) {
      const mockToken = 'mock_jwt_token_' + Date.now();
      setAccessToken(mockToken);
      const user = {
        id: 'user_' + Date.now(),
        email: data.email,
        displayName: data.email.split('@')[0],
      };
      sessionStorage.setItem('user', JSON.stringify(user));
      console.log('[MOCK API] OTP verified, token set');
      return { success: true, token: mockToken, user };
    }
    return { success: false };
  }
  const response = await api.post<VerifyOTPResponse>('/auth/verify-otp', data);
  if (response.data.token) {
    setAccessToken(response.data.token);
  }
  return response.data;
};

/**
 * Login with email and password
 */
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  if (isMockMode) {
    await mockDelay();
    const mockToken = 'mock_jwt_token_' + Date.now();
    setAccessToken(mockToken);
    const user = {
      id: 'user_' + Date.now(),
      email: data.email,
      displayName: data.email.split('@')[0],
    };
    sessionStorage.setItem('user', JSON.stringify(user));
    console.log('[MOCK API] Login successful');
    return { success: true, token: mockToken, user };
  }
  const response = await api.post<LoginResponse>('/auth/login', data);
  if (response.data.token) {
    setAccessToken(response.data.token);
  }
  return response.data;
};

/**
 * Resend OTP code
 */
export const resendOTP = async (email: string): Promise<ResendOTPResponse> => {
  if (isMockMode) {
    await mockDelay();
    console.log('[MOCK API] OTP resent to:', email);
    return { success: true, retry_after_seconds: 60 };
  }
  const response = await api.post<ResendOTPResponse>('/auth/resend-otp', { email });
  return response.data;
};

/**
 * Logout - clears client state
 */
export const logout = (): void => {
  clearAuth();
  console.log('[API] Logged out, client state cleared');
};

// ============================================
// USER API ENDPOINTS
// ============================================

/**
 * Get list of users (requires auth)
 */
export const getUsers = async (): Promise<MockUser[]> => {
  if (isMockMode) {
    await mockDelay(300);
    return mockUsers;
  }
  const response = await api.get<MockUser[]>('/users');
  return response.data;
};

export const getContacts = async (): Promise<ContactRecord[]> => {
  if (isMockMode) {
    await mockDelay(200);
    return mockUsers.slice(0, 3).map((user, idx) => ({
      linkId: `mock_link_${idx}`,
      peer: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      status: 'accepted',
      createdAt: new Date().toISOString(),
      online: user.online,
      sessionKeyBase64: btoa(`mock_session_key_${user.id}`),
      sessionKeyFingerprint: `MOCK-${idx}`,
    }));
  }
  const response = await api.get<ContactRecord[]>('/contacts');
  return response.data;
};

export const addContact = async (email: string): Promise<ContactRecord> => {
  if (isMockMode) {
    await mockDelay(300);
    const newContact: ContactRecord = {
      linkId: `mock_link_${Date.now()}`,
      peer: {
        id: `mock_${Date.now()}`,
        email,
        displayName: email.split('@')[0],
      },
      status: 'accepted',
      createdAt: new Date().toISOString(),
      online: true,
      sessionKeyBase64: btoa('mock_session_key_new'),
      sessionKeyFingerprint: 'MOCK-NEW',
    };
    return newContact;
  }
  const response = await api.post<ContactRecord>('/contacts', { email });
  return response.data;
};

export const requestKdcSessionKey = async (receiverId: string): Promise<KdcSessionResponse> => {
  const response = await api.post<KdcSessionResponse>('/kdc/request-session-key', { receiverId });
  return response.data;
};

export const fetchKdcSessionInfo = async (sessionId: string): Promise<KdcSessionResponse> => {
  const response = await api.get<KdcSessionResponse>(`/kdc/session-info/${sessionId}`);
  return response.data;
};

const postLifecycleAction = async (path: string, kdcSessionId: string): Promise<KdcSessionResponse> => {
  const response = await api.post<KdcSessionResponse>(path, { kdcSessionId });
  return response.data;
};

export const rotateSessionKey = (kdcSessionId: string) => postLifecycleAction('/lifecycle/rotate-session-key', kdcSessionId);
export const revokeSessionKey = (kdcSessionId: string) => postLifecycleAction('/lifecycle/revoke-session-key', kdcSessionId);
export const destroySessionKey = (kdcSessionId: string) => postLifecycleAction('/lifecycle/destroy-session-key', kdcSessionId);

export const fetchLifecycleEvents = async (kdcSessionId?: string, limit: number = 50): Promise<KeyEventRecord[]> => {
  const params = new URLSearchParams();
  if (kdcSessionId) params.set('kdcSessionId', kdcSessionId);
  params.set('limit', limit.toString());
  const response = await api.get<KeyEventRecord[]>(`/lifecycle/key-events?${params.toString()}`);
  return response.data;
};

export const fetchCryptoLogs = async (sources?: string[], limit: number = 100): Promise<KeyEventRecord[]> => {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  (sources || []).forEach((source) => params.append('source', source));
  const response = await api.get<KeyEventRecord[]>(`/crypto/logs?${params.toString()}`);
  return response.data;
};

export const fetchSecurityStatus = async (): Promise<SystemSecurityStatus> => {
  const response = await api.get<SystemSecurityStatus>('/system/security-status');
  return response.data;
};

export const startPfsHandshake = async (receiverId: string): Promise<PfsStartResponse> => {
  const response = await api.post<PfsStartResponse>('/pfs/start', { receiverId });
  return response.data;
};

export const fetchMessageHistory = async (
  peerId?: string,
  limit = 100,
  offset = 0,
): Promise<MessageHistoryResponse> => {
  const params = new URLSearchParams();
  if (peerId) params.set('peer_id', peerId);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());
  const response = await api.get<MessageHistoryResponse>(`/messages/history?${params.toString()}`);
  return response.data;
};

export const completePfsHandshake = async (
  pfsSessionId: string,
  clientEphemeralPublicKey: string,
): Promise<PfsCompleteResponse> => {
  const response = await api.post<PfsCompleteResponse>('/pfs/complete', {
    pfsSessionId,
    clientEphemeralPublicKey,
  });
  return response.data;
};

/**
 * Get current user info
 */
export const getCurrentUser = (): { id: string; email: string; displayName: string } | null => {
  const userStr = sessionStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

// ============================================
// KEYPAIR API ENDPOINTS
// ============================================

/**
 * Request server to generate keypair
 * NOTE: Private keys should NEVER be generated client-side for production
 */
export const generateKeypair = async (): Promise<KeypairResponse> => {
  if (isMockMode) {
    await mockDelay(800);
    return {
      publicKeyFingerprint: 'SHA256:' + Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('').toUpperCase(),
      publicKeyPEM: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
[MOCK KEY DATA]
...IDAQAB
-----END PUBLIC KEY-----`,
    };
  }
  const response = await api.get<KeypairResponse>('/keypair');
  return response.data;
};

// ============================================
// ACCOUNT MANAGEMENT
// ============================================

export interface DeleteAccountRequest {
  password: string;
  confirm: boolean;
}

export interface DeleteAccountResponse {
  message: string;
}

/**
 * Delete the current user's account and all associated data
 */
export const deleteAccount = async (data: DeleteAccountRequest): Promise<DeleteAccountResponse> => {
  if (isMockMode) {
    await mockDelay(500);
    console.log('[MOCK API] Account deletion requested');
    return { message: 'Account and all associated data have been deleted successfully' };
  }
  const response = await api.post<DeleteAccountResponse>('/users/me/delete', data);
  return response.data;
};

export default api;
