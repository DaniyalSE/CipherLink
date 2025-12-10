/**
 * WebSocket/Socket.IO Connection Manager
 * 
 * Manages real-time communication with the backend.
 * Supports both mock mode for demos and real Socket.IO connections.
 * 
 * SECURITY NOTES:
 * - Authentication token is passed via query parameter or cookie
 * - All messages should be validated on the server
 * - Client-side encryption is for demo purposes only
 */

import { io, Socket } from 'socket.io-client';
import { getAccessToken, getContacts, type ContactRecord } from './api';

// Check if we're in mock mode
const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';
const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

const socketConfig = (() => {
  try {
    const fallback = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parsed = new URL(DEFAULT_WS_URL, fallback);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    const base = `${protocol}//${parsed.host}`;
    let path = parsed.pathname || '/ws';
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    const socketPath = `${path || '/ws'}/socket.io`;
    return { base, path: socketPath };
  } catch (_err) {
    return { base: 'http://localhost:8000', path: '/ws/socket.io' };
  }
})();

const SOCKET_BASE_URL = socketConfig.base;
const SOCKET_PATH = socketConfig.path;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ============================================
// TYPES
// ============================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  fromId?: string;
  toId?: string;
  body: string;
  timestamp: Date;
  type: 'incoming' | 'outgoing' | 'system';
  signed?: boolean;
  signatureStatus?: 'valid' | 'invalid' | 'unsigned' | 'missing';
  hash?: string;
  contactLinkId?: string | null;
  sessionKeyPeerId?: string | null;
  sessionKeyFingerprint?: string | null;
}

export interface PresenceUpdate {
  userId: string;
  displayName: string;
  online: boolean;
}

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: 'connect' | 'disconnect' | 'message' | 'presence' | 'error' | 'ping' | 'system';
  data: string;
  raw?: object;
}

type MessageHandler = (message: ChatMessage) => void;
type PresenceHandler = (update: PresenceUpdate) => void;
type DebugHandler = (log: DebugLog) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type ContactUpdateHandler = (contact: ContactRecord) => void;

export interface StructuredSocketEvent<TPayload = Record<string, unknown>> {
  type: string;
  payload: TPayload;
}

export type CryptoStageSocketEvent = StructuredSocketEvent<Record<string, unknown>>;

interface ServerMessagePayload {
  id?: string;
  from?: string;
  from_id?: string;
  to?: string;
  to_id?: string;
  body?: string;
  ciphertext_base64?: string;
  iv_base64?: string;
  signature_base64?: string;
  signature_status?: ChatMessage['signatureStatus'];
  message_hash?: string;
  meta?: Record<string, unknown>;
  timestamp?: string | number | Date;
  type?: ChatMessage['type'];
  contact_link_id?: string;
  session_key_peer_id?: string;
  session_key_fingerprint?: string;
}

// ============================================
// SOCKET MANAGER CLASS
// ============================================

class SocketManager {
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private messageHandlers: MessageHandler[] = [];
  private presenceHandlers: PresenceHandler[] = [];
  private debugHandlers: DebugHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private contactHandlers: ContactUpdateHandler[] = [];
  private kdcHandlers: Array<(event: StructuredSocketEvent) => void> = [];
  private lifecycleHandlers: Array<(event: StructuredSocketEvent) => void> = [];
  private pfsHandlers: Array<(event: StructuredSocketEvent) => void> = [];
  private stageHandlers: Array<(event: CryptoStageSocketEvent) => void> = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private mockMessageInterval: number | null = null;
  private sessionKeys: Record<string, { base64: string; fingerprint?: string; cryptoKey?: CryptoKey; pending?: Promise<CryptoKey> }> = {};
  private hydrateTasks: Record<string, Promise<void>> = {};
  private currentUserId: string | null = null;

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (isMockMode) {
      this.connectMock();
      return;
    }

    const token = getAccessToken();
    if (!token) {
      this.logDebug('error', 'Cannot connect: No auth token');
      return;
    }

    this.setStatus('connecting');
    this.logDebug('connect', `Connecting to ${SOCKET_BASE_URL}${SOCKET_PATH}...`);

    this.socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      query: { token },
      auth: { token },
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.setupEventHandlers();
  }

  /**
   * Provide the currently authenticated user ID so we can resolve peer keys
   */
  setCurrentUser(userId: string | null): void {
    this.currentUserId = userId;
  }

  /**
   * Register contacts along with their negotiated session keys
   */
  registerContactSessions(contacts: ContactRecord[]): void {
    contacts.forEach(contact => this.storeSessionKey(contact));
  }

  private storeSessionKey(contact: ContactRecord): void {
    const peerId = contact.peer.id;
    this.sessionKeys[peerId] = {
      base64: contact.sessionKeyBase64,
      fingerprint: contact.sessionKeyFingerprint,
    };
  }

  private async refreshContactSessions(): Promise<void> {
    try {
      const contacts = await getContacts();
      this.registerContactSessions(contacts);
    } catch (error) {
      const err = error as Error;
      this.logDebug('error', `Failed to refresh contact sessions: ${err.message}`);
    }
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.logDebug('connect', `Connected with ID: ${this.socket?.id}`);
      this.joinGlobal();
    });

    this.socket.on('disconnect', (reason) => {
      this.setStatus('disconnected');
      this.logDebug('disconnect', `Disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      this.setStatus('error');
      this.logDebug('error', `Connection error: ${error.message}`);
    });

    this.socket.on('message', (data: ServerMessagePayload) => {
      this.logDebug('message', `Message from ${data.from ?? 'unknown'}`, data as object);
      void this.handleIncomingPayload(data);
    });

    this.socket.on('presence', (data: PresenceUpdate) => {
      this.logDebug('presence', `${data.displayName} is ${data.online ? 'online' : 'offline'}`, data);
      this.presenceHandlers.forEach(handler => handler(data));
    });

    this.socket.on('contact', (data: ContactRecord) => {
      this.logDebug('system', `Contact update: ${data.peer.displayName}`, data as object);
      this.handleContactUpdate(data);
    });

    this.socket.on('system', (data: { message: string }) => {
      this.logDebug('system', data.message, data);
    });

    const forwardStructuredEvent = (
      handlers: Array<(event: StructuredSocketEvent) => void>,
      type: string,
      payload: Record<string, unknown>,
    ) => {
      const structured = { type, payload };
      handlers.forEach(handler => handler(structured));
    };

    const kdcEvents = ['kdc:new-session-key', 'kdc:key-revoked'];
    kdcEvents.forEach(eventName => {
      this.socket?.on(eventName, (data: Record<string, unknown>) => {
        forwardStructuredEvent(this.kdcHandlers, eventName, data);
        if (eventName === 'kdc:new-session-key') {
          void this.refreshContactSessions();
        }
      });
    });

    const lifecycleEvents = ['lifecycle:rotated', 'lifecycle:revoked', 'lifecycle:destroyed', 'lifecycle:expired'];
    lifecycleEvents.forEach(eventName => {
      this.socket?.on(eventName, (data: Record<string, unknown>) => {
        forwardStructuredEvent(this.lifecycleHandlers, eventName, data);
      });
    });

    ['pfs:initiated', 'pfs:established'].forEach(eventName => {
      this.socket?.on(eventName, (data: Record<string, unknown>) => {
        forwardStructuredEvent(this.pfsHandlers, eventName, data);
      });
    });

    const stageEvents = [
      'hash_generated',
      'aes_key_selected',
      'rc4_or_stream_cipher_generated',
      'signature_created',
      'ciphertext_generated',
      'message_sent',
      'message_received',
      'signature_verified',
      'decrypted_message',
    ];
    stageEvents.forEach(eventName => {
      this.socket?.on(eventName, (data: Record<string, unknown>) => {
        const structured = { type: eventName, payload: data };
        this.stageHandlers.forEach(handler => handler(structured));
        this.logDebug('system', `[Stage] ${eventName}`, data);
      });
    });

    // Ping for latency measurement
    this.socket.on('pong', () => {
      this.logDebug('ping', `RTT: ${Date.now() - (this.lastPingTime || Date.now())}ms`);
    });
  }

  private lastPingTime: number = 0;

  private async handleIncomingPayload(payload: ServerMessagePayload): Promise<void> {
    try {
      const message = await this.normalizeIncomingMessage(payload);
      this.messageHandlers.forEach(handler => handler(message));
    } catch (error) {
      const err = error as Error;
      this.logDebug('error', `Failed to process incoming payload: ${err.message}`, payload as object);
    }
  }

  private async normalizeIncomingMessage(payload: ServerMessagePayload): Promise<ChatMessage> {
    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const signatureStatus = payload.signature_status ?? (payload.signature_base64 ? 'invalid' : 'unsigned');
    const resolvedType: ChatMessage['type'] =
      payload.type ?? (payload.from_id && this.currentUserId && payload.from_id === this.currentUserId ? 'outgoing' : 'incoming');

    let body = payload.body || '';
    let peerId: string | null = null;
    if (payload.ciphertext_base64 && payload.iv_base64) {
      try {
        peerId = this.resolvePeerId(payload);
        body = await this.decryptBody(payload, peerId);
      } catch (error) {
        const err = error as Error;
        this.logDebug('error', `Failed to decrypt message ${payload.id ?? ''}: ${err.message}`);
        body = '[Encrypted message: unable to decrypt]';
      }
    }

    return {
      id: payload.id || `msg_${timestamp.getTime()}`,
      from: payload.from || (payload.from_id === this.currentUserId ? 'you' : 'system'),
      to: payload.to || 'you',
      fromId: payload.from_id,
      toId: payload.to_id,
      body,
      timestamp,
      type: resolvedType,
      signed: Boolean(payload.signature_base64),
      signatureStatus: body === '[Encrypted message: unable to decrypt]' ? 'invalid' : signatureStatus,
      hash: payload.message_hash,
      contactLinkId: payload.contact_link_id,
      sessionKeyPeerId: peerId,
      sessionKeyFingerprint: payload.session_key_fingerprint,
    };
  }

  /**
   * Mock mode connection - simulates a WebSocket connection
   */
  private connectMock(): void {
    this.setStatus('connecting');
    this.logDebug('connect', '[MOCK] Initializing mock WebSocket...');

    setTimeout(() => {
      this.setStatus('connected');
      this.logDebug('connect', '[MOCK] Connected to mock server');
      this.logDebug('system', '[MOCK] Welcome to SecureTerminal mock mode');

      // Simulate presence updates
      const mockUsers = ['alice', 'bob', 'daemon'];
      mockUsers.forEach((user, i) => {
        setTimeout(() => {
          this.presenceHandlers.forEach(handler => handler({
            userId: `mock_${user}`,
            displayName: user,
            online: true,
          }));
          this.logDebug('presence', `[MOCK] ${user} is now online`);
        }, (i + 1) * 1000);
      });

      // Simulate incoming messages periodically
      this.startMockMessages();
    }, 800);
  }

  /**
   * Start sending mock messages for demo purposes
   */
  private startMockMessages(): void {
    const mockMessages = [
      { from: 'alice', body: 'Connection secured. AES-256 encryption active.' },
      { from: 'bob', body: 'Running vulnerability scan on target...' },
      { from: 'daemon', body: '[SYSTEM] All nodes operational. Latency: 12ms' },
      { from: 'alice', body: 'SSH tunnel established. Ready for data transfer.' },
      { from: 'bob', body: 'Packet analysis complete. No anomalies detected.' },
    ];

    let index = 0;
    this.mockMessageInterval = window.setInterval(() => {
      if (this.status !== 'connected') return;
      
      const msg = mockMessages[index % mockMessages.length];
      const payload: ServerMessagePayload = {
        id: `mock_${Date.now()}`,
        from: msg.from,
        to: 'you',
        body: msg.body,
        timestamp: new Date(),
        signature_status: Math.random() > 0.3 ? 'valid' : 'unsigned',
      };

      void this.handleIncomingPayload(payload);
      this.logDebug('message', `[MOCK] ${msg.from}: ${msg.body.substring(0, 30)}...`, payload as object);
      
      index++;
    }, 8000);
  }

  /**
   * Send a message to a specific user
   */
  async sendMessage(to: string, body: string, metadata?: Record<string, unknown>): Promise<void> {
    const timestamp = new Date();
    const contactLinkId = typeof metadata?.contact_link_id === 'string' ? String(metadata.contact_link_id) : undefined;
    const roomId = contactLinkId ?? 'global';
    const message: ChatMessage = {
      id: `msg_${timestamp.getTime()}`,
      from: 'you',
      to,
      body,
      timestamp,
      type: 'outgoing',
      fromId: this.currentUserId ?? undefined,
      toId: to,
      contactLinkId,
    };

    if (isMockMode) {
      this.logDebug('message', `[MOCK] Sending to ${to}: ${body.substring(0, 30)}...`, message);
      this.messageHandlers.forEach(handler => handler(message));
      return;
    }

    if (!this.socket?.connected) {
      this.logDebug('error', 'Cannot send message: Not connected');
      return;
    }

    try {
      const peerId = to !== 'all' ? to : null;
      if (peerId) {
        message.sessionKeyPeerId = peerId;
        message.sessionKeyFingerprint = this.sessionKeys[peerId]?.fingerprint;
      }
      const { ciphertextBase64, ivBase64 } = await this.encryptBody(body, peerId);
      const payload = {
        to,
        ciphertext_base64: ciphertextBase64,
        iv_base64: ivBase64,
        contact_id: roomId,
        meta: {
          client: 'web',
          encoding: 'utf-8',
          sent_at: timestamp.toISOString(),
          ...(metadata || {}),
        },
      };
      this.socket.emit('message', payload);
      this.logDebug('message', `Sent to ${to}: [encrypted]`, payload as object);
      this.messageHandlers.forEach(handler => handler(message));
    } catch (error) {
      const err = error as Error;
      this.logDebug('error', `Failed to encrypt message: ${err.message}`);
    }
  }

  joinContact(contactId: string): void {
    if (!contactId) return;
    this.joinChannel(contactId);
  }

  joinGlobal(): void {
    this.joinChannel('global');
  }

  private joinChannel(contactId: string): void {
    if (isMockMode) return;
    if (!this.socket?.connected) {
      this.logDebug('error', `Cannot join ${contactId}: socket disconnected`);
      return;
    }
    this.socket.emit('join', { contact_id: contactId });
    this.logDebug('system', `Joined channel ${contactId}`);
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.mockMessageInterval) {
      clearInterval(this.mockMessageInterval);
      this.mockMessageInterval = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.setStatus('disconnected');
    this.logDebug('disconnect', 'Disconnected from server');
    this.clearSessionKeys();
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach(handler => handler(status));
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Subscribe to presence updates
   */
  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.push(handler);
    return () => {
      this.presenceHandlers = this.presenceHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Subscribe to debug logs
   */
  onDebug(handler: DebugHandler): () => void {
    this.debugHandlers.push(handler);
    return () => {
      this.debugHandlers = this.debugHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  onContactUpdate(handler: ContactUpdateHandler): () => void {
    this.contactHandlers.push(handler);
    return () => {
      this.contactHandlers = this.contactHandlers.filter(h => h !== handler);
    };
  }

  onKdcEvent(handler: (event: StructuredSocketEvent) => void): () => void {
    this.kdcHandlers.push(handler);
    return () => {
      this.kdcHandlers = this.kdcHandlers.filter(h => h !== handler);
    };
  }

  onLifecycleEvent(handler: (event: StructuredSocketEvent) => void): () => void {
    this.lifecycleHandlers.push(handler);
    return () => {
      this.lifecycleHandlers = this.lifecycleHandlers.filter(h => h !== handler);
    };
  }

  onPfsEvent(handler: (event: StructuredSocketEvent) => void): () => void {
    this.pfsHandlers.push(handler);
    return () => {
      this.pfsHandlers = this.pfsHandlers.filter(h => h !== handler);
    };
  }

  onCryptoStage(handler: (event: CryptoStageSocketEvent) => void): () => void {
    this.stageHandlers.push(handler);
    return () => {
      this.stageHandlers = this.stageHandlers.filter(h => h !== handler);
    };
  }

  private handleContactUpdate(contact: ContactRecord): void {
    this.storeSessionKey(contact);
    this.contactHandlers.forEach(handler => handler(contact));
  }

  private clearSessionKeys(): void {
    this.sessionKeys = {};
  }

  private async encryptBody(body: string, peerId: string | null): Promise<{ ciphertextBase64: string; ivBase64: string }> {
    const key = peerId ? await this.getPeerCryptoKey(peerId) : await ensureGlobalSessionKey();
    return encryptWithKey(key, body);
  }

  private async decryptBody(payload: ServerMessagePayload, peerId: string | null): Promise<string> {
    const key = peerId ? await this.getPeerCryptoKey(peerId) : await ensureGlobalSessionKey();
    return decryptWithKey(key, payload.ciphertext_base64!, payload.iv_base64!);
  }

  private resolvePeerId(payload: ServerMessagePayload): string | null {
    if (payload.session_key_peer_id && payload.session_key_peer_id !== this.currentUserId) {
      return payload.session_key_peer_id;
    }
    if (!this.currentUserId) {
      return payload.session_key_peer_id ?? null;
    }
    if (payload.from_id && payload.from_id !== this.currentUserId) {
      return payload.from_id;
    }
    if (payload.to_id && payload.to_id !== this.currentUserId) {
      return payload.to_id;
    }
    return payload.session_key_peer_id ?? null;
  }

  private async ensurePeerSessionKey(peerId: string): Promise<void> {
    if (this.sessionKeys[peerId]) return;
    if (!this.hydrateTasks[peerId]) {
      this.hydrateTasks[peerId] = (async () => {
        try {
          const contacts = await getContacts();
          this.registerContactSessions(contacts);
        } catch (error) {
          const err = error as Error;
          this.logDebug('error', `Failed to hydrate session key for ${peerId}: ${err.message}`);
        } finally {
          delete this.hydrateTasks[peerId];
        }
      })();
    }
    await this.hydrateTasks[peerId];
  }

  private async getPeerCryptoKey(peerId: string): Promise<CryptoKey> {
    if (!this.sessionKeys[peerId]) {
      await this.ensurePeerSessionKey(peerId);
    }
    const entry = this.sessionKeys[peerId];
    if (!entry) {
      throw new Error(`No session key for peer ${peerId}`);
    }
    if (entry.cryptoKey) {
      return entry.cryptoKey;
    }
    if (!entry.pending) {
      entry.pending = importAesKeyFromBase64(entry.base64)
        .then(key => {
          entry.cryptoKey = key;
          entry.pending = undefined;
          return key;
        })
        .catch(error => {
          entry.pending = undefined;
          throw error;
        });
    }
    return entry.pending;
  }

  private logDebug(type: DebugLog['type'], data: string, raw?: object): void {
    const log: DebugLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      data,
      raw,
    };
    this.debugHandlers.forEach(handler => handler(log));
  }

  /**
   * Send a ping to measure latency
   */
  ping(): void {
    if (isMockMode) {
      const mockRtt = Math.floor(Math.random() * 50) + 10;
      this.logDebug('ping', `[MOCK] RTT: ${mockRtt}ms`);
      return;
    }

    if (this.socket?.connected) {
      this.lastPingTime = Date.now();
      this.socket.emit('ping');
    }
  }
}

// Export singleton instance
export const socketManager = new SocketManager();

// ============================================
// AES SESSION HELPERS (Demo purposes only)
// ============================================

const AES_BLOCK_SIZE = 16;
const GLOBAL_AES_KEY_STORAGE_KEY = 'cipherlink:aes-session-key';
let cachedGlobalSessionKey: CryptoKey | null = null;
let globalSessionKeyPromise: Promise<CryptoKey> | null = null;

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_err) {
    return null;
  }
};

const bytesToBase64 = (input: ArrayBuffer | Uint8Array): string => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
};

const getCryptoApi = (): Crypto => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto API is not available in this environment');
};

const pkcs7Pad = (data: Uint8Array): Uint8Array => {
  const remainder = data.length % AES_BLOCK_SIZE;
  const padLength = remainder === 0 ? AES_BLOCK_SIZE : AES_BLOCK_SIZE - remainder;
  const padded = new Uint8Array(data.length + padLength);
  padded.set(data);
  padded.fill(padLength, data.length);
  return padded;
};

const pkcs7Unpad = (data: Uint8Array): Uint8Array => {
  if (data.length === 0 || data.length % AES_BLOCK_SIZE !== 0) {
    throw new Error('Invalid ciphertext length');
  }
  const padLength = data[data.length - 1];
  if (padLength <= 0 || padLength > AES_BLOCK_SIZE) {
    throw new Error('Invalid padding length');
  }
  for (let i = data.length - padLength; i < data.length; i++) {
    if (data[i] !== padLength) {
      throw new Error('Invalid padding bytes');
    }
  }
  return data.slice(0, data.length - padLength);
};

const importAesKeyFromBase64 = async (base64Key: string): Promise<CryptoKey> => {
  const subtle = getCryptoApi().subtle;
  const raw = base64ToBytes(base64Key);
  return subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-CBC' }, true, ['encrypt', 'decrypt']);
};

const persistGlobalKey = (rawBase64: string): void => {
  const storage = getSessionStorage();
  storage?.setItem(GLOBAL_AES_KEY_STORAGE_KEY, rawBase64);
};

const ensureGlobalSessionKey = async (): Promise<CryptoKey> => {
  if (cachedGlobalSessionKey) return cachedGlobalSessionKey;
  if (globalSessionKeyPromise) return globalSessionKeyPromise;

  globalSessionKeyPromise = (async () => {
    const storage = getSessionStorage();
    const storedKey = storage?.getItem(GLOBAL_AES_KEY_STORAGE_KEY);
    if (storedKey) {
      cachedGlobalSessionKey = await importAesKeyFromBase64(storedKey);
      return cachedGlobalSessionKey;
    }

    const subtle = getCryptoApi().subtle;
    const key = await subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await subtle.exportKey('raw', key);
    const base64 = bytesToBase64(raw);
    persistGlobalKey(base64);
    cachedGlobalSessionKey = key;
    return cachedGlobalSessionKey;
  })();

  try {
    return await globalSessionKeyPromise;
  } finally {
    globalSessionKeyPromise = null;
  }
};

const createIv = (): Uint8Array => {
  const iv = new Uint8Array(AES_BLOCK_SIZE);
  getCryptoApi().getRandomValues(iv);
  return iv;
};

const encryptWithKey = async (key: CryptoKey, plaintext: string): Promise<{ ciphertextBase64: string; ivBase64: string }> => {
  const iv = createIv();
  const ivBuffer = toArrayBuffer(iv);
  const padded = pkcs7Pad(textEncoder.encode(plaintext));
  const subtle = getCryptoApi().subtle;
  const ciphertext = await subtle.encrypt({ name: 'AES-CBC', iv: ivBuffer }, key, toArrayBuffer(padded));
  return {
    ciphertextBase64: bytesToBase64(ciphertext),
    ivBase64: bytesToBase64(iv),
  };
};

const decryptWithKey = async (key: CryptoKey, ciphertextBase64: string, ivBase64: string): Promise<string> => {
  const subtle = getCryptoApi().subtle;
  const ciphertext = base64ToBytes(ciphertextBase64);
  const iv = base64ToBytes(ivBase64);
  const ivBuffer = toArrayBuffer(iv);
  const padded = await subtle.decrypt({ name: 'AES-CBC', iv: ivBuffer }, key, toArrayBuffer(ciphertext));
  const plaintextBytes = pkcs7Unpad(new Uint8Array(padded));
  return textDecoder.decode(plaintextBytes);
};

// ============================================
// CRYPTO UTILITIES (Demo purposes only)
// ============================================

/**
 * Calculate SHA-256 hash of a message
 * This is a client-side utility for demo purposes
 */
export const calculateHash = async (message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * WARNING: This is for demo purposes only!
 * Real signatures should be done server-side or with hardware security modules.
 * This creates an ephemeral key pair that is NOT secure for production.
 */
export const signMessageDemo = async (message: string): Promise<{ signature: string; warning: string }> => {
  console.warn('[SECURITY] Demo signing only! Use server-side signing in production.');
  
  // Create ephemeral key pair (NOT for production use)
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    data
  );

  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    signature: signatureHex,
    warning: 'DEMO ONLY: This ephemeral signature is not secure for production. Real signing should use server-side HSM or hardware-backed keys.',
  };
};
