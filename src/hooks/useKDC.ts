import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  requestKdcSessionKey,
  rotateSessionKey,
  revokeSessionKey,
  destroySessionKey,
  fetchKdcSessionInfo,
  type KdcSessionResponse,
} from '@/lib/api';
import { socketManager, type StructuredSocketEvent } from '@/lib/socket';

export interface KdcEventLog extends StructuredSocketEvent {
  timestamp: number;
}

export interface KdcSessionSnapshot {
  kdcSessionId: string;
  fingerprint?: string;
  status: 'issued' | 'revoked';
  updatedAt: number;
  actorId?: string;
}

export interface KdcSummaryMetrics {
  totalIssued: number;
  totalRevoked: number;
  lastIssuedFingerprint?: string;
}

export const useKDC = () => {
  const [events, setEvents] = useState<KdcEventLog[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    return socketManager.onKdcEvent((event) => {
      setEvents((prev) => [{ ...event, timestamp: Date.now() }, ...prev].slice(0, 20));
      if (event.type === 'kdc:new-session-key') {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      }
    });
  }, [queryClient]);

  const requestSessionKey = useMutation({
    mutationFn: requestKdcSessionKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const rotateMutation = useMutation({
    mutationFn: rotateSessionKey,
    onSuccess: (data: KdcSessionResponse) => queryClient.invalidateQueries({ queryKey: ['kdc-session', data.kdcSessionId] }),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSessionKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const destroyMutation = useMutation({
    mutationFn: destroySessionKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const getSessionInfo = (sessionId: string) =>
    queryClient.fetchQuery({ queryKey: ['kdc-session', sessionId], queryFn: () => fetchKdcSessionInfo(sessionId) });

  const summary: KdcSummaryMetrics = useMemo(() => {
    let totalIssued = 0;
    let totalRevoked = 0;
    let lastIssued: KdcEventLog | null = null;

    events.forEach(event => {
      if (event.type === 'kdc:new-session-key') {
        totalIssued += 1;
        if (!lastIssued || event.timestamp > lastIssued.timestamp) {
          lastIssued = event;
        }
      }
      if (event.type === 'kdc:key-revoked') {
        totalRevoked += 1;
      }
    });

    return {
      totalIssued,
      totalRevoked,
      lastIssuedFingerprint: (lastIssued?.payload?.fingerprint as string) ?? undefined,
    };
  }, [events]);

  const recentSessions: KdcSessionSnapshot[] = useMemo(() => {
    const map = new Map<string, KdcSessionSnapshot>();
    events.forEach(event => {
      const payload = event.payload ?? {};
      const rawSessionId = (payload.kdcSessionId ?? payload.sessionId) as string | undefined;
      if (!rawSessionId) return;
      const fingerprint = typeof payload.fingerprint === 'string' ? payload.fingerprint : undefined;
      const actorId = typeof payload.actorId === 'string' ? payload.actorId : undefined;
      const snapshot: KdcSessionSnapshot = {
        kdcSessionId: rawSessionId,
        fingerprint,
        actorId,
        status: event.type === 'kdc:key-revoked' ? 'revoked' : 'issued',
        updatedAt: event.timestamp,
      };
      map.set(rawSessionId, snapshot);
    });
    return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [events]);

  return {
    events,
    summary,
    recentSessions,
    requestSessionKey: requestSessionKey.mutateAsync,
    rotateSessionKey: rotateMutation.mutateAsync,
    revokeSessionKey: revokeMutation.mutateAsync,
    destroySessionKey: destroyMutation.mutateAsync,
    fetchSessionInfo: getSessionInfo,
    isRequesting: requestSessionKey.isPending,
  };
};
