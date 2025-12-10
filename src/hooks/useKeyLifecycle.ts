import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLifecycleEvents, type KeyEventRecord } from '@/lib/api';
import { socketManager, type StructuredSocketEvent } from '@/lib/socket';

export interface LifecycleStats {
  rotations: number;
  revocations: number;
  destructions: number;
}

export interface LifecycleTimelineEntry {
  id: string;
  createdAt: string;
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  payload: Record<string, unknown>;
  actorId?: string | null;
}

export interface LifecycleEventLog extends StructuredSocketEvent {
  timestamp: number;
}

export const useKeyLifecycle = (kdcSessionId?: string) => {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<LifecycleEventLog[]>([]);

  useEffect(() => {
    return socketManager.onLifecycleEvent((event) => {
      const enriched: LifecycleEventLog = { ...event, timestamp: Date.now() };
      setEvents((prev) => [enriched, ...prev].slice(0, 25));
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events', kdcSessionId ?? 'all'] });
    });
  }, [queryClient, kdcSessionId]);

  const lifecycleQuery = useQuery<KeyEventRecord[]>({
    queryKey: ['lifecycle-events', kdcSessionId ?? 'all'],
    queryFn: () => fetchLifecycleEvents(kdcSessionId),
    refetchInterval: 8000,
  });

  const stats: LifecycleStats = useMemo(() => {
    return (lifecycleQuery.data ?? []).reduce<LifecycleStats>(
      (acc, event) => {
        if (event.eventType === 'rotated') acc.rotations += 1;
        if (event.eventType === 'revoked') acc.revocations += 1;
        if (event.eventType === 'destroyed') acc.destructions += 1;
        return acc;
      },
      { rotations: 0, revocations: 0, destructions: 0 },
    );
  }, [lifecycleQuery.data]);

  const timeline: LifecycleTimelineEntry[] = useMemo(() => {
    const badgeMap: Record<string, LifecycleTimelineEntry['badgeVariant']> = {
      rotated: 'secondary',
      revoked: 'destructive',
      destroyed: 'destructive',
      generated: 'default',
      start: 'default',
    };

    return (lifecycleQuery.data ?? []).map(event => ({
      id: event.id,
      createdAt: event.createdAt,
      label: event.eventType,
      badgeVariant: badgeMap[event.eventType] ?? 'outline',
      payload: event.payload ?? {},
      actorId: event.actorId,
    }));
  }, [lifecycleQuery.data]);

  return {
    events,
    lifecycleHistory: lifecycleQuery.data ?? [],
    stats,
    timeline,
    isLoading: lifecycleQuery.isLoading,
    refetch: lifecycleQuery.refetch,
  };
};
