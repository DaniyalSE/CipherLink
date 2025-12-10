import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { completePfsHandshake, startPfsHandshake, type PfsCompleteResponse } from '@/lib/api';
import { socketManager, type StructuredSocketEvent } from '@/lib/socket';

const arrayBufferToPem = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return ['-----BEGIN PUBLIC KEY-----', ...lines, '-----END PUBLIC KEY-----'].join('\n');
};

const exportClientPublicKey = async (): Promise<string> => {
  const subtle = window.crypto.subtle;
  const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const exported = await subtle.exportKey('spki', keyPair.publicKey);
  return arrayBufferToPem(exported);
};

export interface PfsEventLog extends StructuredSocketEvent {
  timestamp: number;
}

export interface PfsStats {
  initiated: number;
  established: number;
  pendingSessionId: string | null;
}

export const usePFS = () => {
  const [events, setEvents] = useState<PfsEventLog[]>([]);
  const [lastSession, setLastSession] = useState<PfsCompleteResponse | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  useEffect(() => {
    return socketManager.onPfsEvent((event) => {
      const enriched: PfsEventLog = { ...event, timestamp: Date.now() };
      setEvents((prev) => [enriched, ...prev].slice(0, 20));
      if (event.type === 'pfs:initiated') {
        const sessionId = typeof event.payload?.pfsSessionId === 'string' ? event.payload.pfsSessionId : null;
        if (sessionId) {
          setPendingSessionId(sessionId);
        }
      }
      if (event.type === 'pfs:established') {
        setPendingSessionId(null);
      }
    });
  }, []);

  const startMutation = useMutation({
    mutationFn: startPfsHandshake,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ pfsSessionId }: { pfsSessionId: string }) => {
      const clientEphemeralPublicKey = await exportClientPublicKey();
      const response = await completePfsHandshake(pfsSessionId, clientEphemeralPublicKey);
      setLastSession(response);
      setPendingSessionId(null);
      return response;
    },
  });

  const stats: PfsStats = useMemo(() => {
    let initiated = 0;
    let established = 0;
    events.forEach(event => {
      if (event.type === 'pfs:initiated') initiated += 1;
      if (event.type === 'pfs:established') established += 1;
    });
    return { initiated, established, pendingSessionId };
  }, [events, pendingSessionId]);

  return {
    events,
    lastSession,
    stats,
    pendingSessionId,
    startHandshake: startMutation.mutateAsync,
    completeHandshake: completeMutation.mutateAsync,
    isStarting: startMutation.isPending,
    isCompleting: completeMutation.isPending,
  };
};
