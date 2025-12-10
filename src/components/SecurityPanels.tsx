import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import CryptoLogPanel from '@/components/CryptoLogPanel';
import { fetchSecurityStatus } from '@/lib/api';
import { useKDC } from '@/hooks/useKDC';
import { useKeyLifecycle } from '@/hooks/useKeyLifecycle';
import { usePFS } from '@/hooks/usePFS';

const SecurityPanels: React.FC = () => {
  const { data: status } = useQuery({
    queryKey: ['system-security-status'],
    queryFn: fetchSecurityStatus,
    refetchInterval: 10000,
  });

  const { events: kdcEvents, summary: kdcSummary, recentSessions } = useKDC();
  const { events: lifecycleEvents, stats: lifecycleStats, timeline: lifecycleTimeline } = useKeyLifecycle();
  const { events: pfsEvents, stats: pfsStats, lastSession } = usePFS();

  const metric = (label: string, value: string | number, accent?: string) => (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  );

  const formatTimestamp = (value?: number | string) => {
    if (!value) return '—';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString(undefined, { hour12: false });
  };

  const eventFeed = (
    items: Array<{ type: string; payload: Record<string, unknown>; timestamp?: number }>,
    emptyLabel: string,
  ) => (
    <div className="space-y-2 text-xs text-muted-foreground">
      {items.slice(0, 5).map((item, idx) => (
        <div key={`${item.type}-${idx}`} className="rounded border border-border/60 bg-background/50 p-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">[{item.type}]</span>
            {item.timestamp && <span className="text-[11px]">{formatTimestamp(item.timestamp)}</span>}
          </div>
          <pre className="mt-1 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(item.payload, null, 2)}
          </pre>
        </div>
      ))}
      {items.length === 0 && <p>{emptyLabel}</p>}
    </div>
  );

  const sessionList = () => (
    <ul className="space-y-2 text-xs">
      {recentSessions.slice(0, 4).map((session) => (
        <li key={session.kdcSessionId} className="rounded border border-border/60 bg-background/50 p-2">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>{session.kdcSessionId.slice(0, 8)}…</span>
            <Badge variant={session.status === 'issued' ? 'outline' : 'destructive'}>{session.status}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Fingerprint: {session.fingerprint ? session.fingerprint.slice(0, 16) + '…' : 'pending'}
          </p>
          {session.actorId && (
            <p className="text-[11px] text-muted-foreground">Actor: {session.actorId}</p>
          )}
        </li>
      ))}
      {recentSessions.length === 0 && <li className="text-muted-foreground">No session activity yet.</li>}
    </ul>
  );

  const lifecycleTimelineList = () => (
    <ol className="space-y-3 text-xs text-muted-foreground">
      {lifecycleTimeline.slice(0, 6).map((entry) => (
        <li key={entry.id} className="rounded border border-border/60 bg-background/50 p-3">
          <div className="flex items-center justify-between">
            <Badge variant={entry.badgeVariant}>{entry.label}</Badge>
            <span className="text-[11px]">{formatTimestamp(entry.createdAt)}</span>
          </div>
          {entry.actorId && <p className="mt-1 text-[11px]">Actor: {entry.actorId}</p>}
          <pre className="mt-2 text-[11px] leading-snug whitespace-pre-wrap break-all">
            {JSON.stringify(entry.payload ?? {}, null, 2)}
          </pre>
        </li>
      ))}
      {lifecycleTimeline.length === 0 && <li>No lifecycle entries yet.</li>}
    </ol>
  );

  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        {metric('Active Sessions', status?.activeSessions ?? 0, 'text-terminal-cyan')}
        {metric('KDC Sessions', status?.activeKDCSessions ?? 0, 'text-primary')}
        {metric('Recent Rotations', status?.recentKeyRotations ?? 0, 'text-terminal-amber')}
        {metric('Forward Secrecy', status?.forwardSecrecyActive ? 'Enabled' : 'Idle', 'text-terminal-green')}
      </div>

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="kdc">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline">KDC</Badge>
              <span>KDC Events Panel</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              {metric('Issued', kdcSummary.totalIssued, 'text-terminal-cyan')}
              {metric('Revoked', kdcSummary.totalRevoked, 'text-terminal-amber')}
              {metric('Last Fingerprint', kdcSummary.lastIssuedFingerprint ? `${kdcSummary.lastIssuedFingerprint.slice(0, 6)}…` : '—', 'text-foreground')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Recent Sessions</p>
                {sessionList()}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Realtime Feed</p>
                {eventFeed(kdcEvents, 'No realtime KDC events yet.')}
              </div>
            </div>
            <div className="mt-3">
              <CryptoLogPanel title="KDC Audit Trail" sources={['KDC']} />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pfs">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-terminal-amber border-terminal-amber/40">PFS</Badge>
              <span>Forward Secrecy Panel</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              {metric('Handshakes', pfsStats.initiated, 'text-terminal-amber')}
              {metric('Established', pfsStats.established, 'text-terminal-green')}
              {metric('Pending', pfsStats.pendingSessionId ? 'In-flight' : 'Idle', pfsStats.pendingSessionId ? 'text-primary' : 'text-muted-foreground')}
            </div>
            {lastSession && (
              <div className="mb-3 rounded border border-border/60 bg-background/50 p-3 text-xs">
                <p className="font-semibold text-foreground">Last Session Key</p>
                <p className="text-[11px] text-muted-foreground">Session: {lastSession.pfsSessionId}</p>
                <pre className="mt-1 text-[11px] leading-snug whitespace-pre-wrap break-all">
                  {lastSession.sessionKeyBase64}
                </pre>
              </div>
            )}
            {eventFeed(pfsEvents, 'No forward secrecy activity yet.')}
            <div className="mt-3">
              <CryptoLogPanel title="PFS Handshakes" sources={['PFS']} />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="lifecycle">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40">Lifecycle</Badge>
              <span>Key Lifecycle Panel</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              {metric('Rotations', lifecycleStats.rotations, 'text-terminal-cyan')}
              {metric('Revocations', lifecycleStats.revocations, 'text-terminal-amber')}
              {metric('Destructions', lifecycleStats.destructions, 'text-destructive')}
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Lifecycle Timeline</p>
                {lifecycleTimelineList()}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Realtime Feed</p>
                {eventFeed(lifecycleEvents, 'Awaiting lifecycle events.')}
              </div>
            </div>
            <div className="mt-3">
              <CryptoLogPanel title="Lifecycle Timeline" sources={['LIFECYCLE', 'AES', 'RSA']} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default SecurityPanels;
