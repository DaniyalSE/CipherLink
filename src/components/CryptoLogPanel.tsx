import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCryptoLogs, type KeyEventRecord } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CryptoLogPanelProps {
  title: string;
  sources?: string[];
  autoRefreshMs?: number;
}

const sourceColors: Record<string, string> = {
  KDC: 'text-terminal-cyan',
  PFS: 'text-terminal-green',
  LIFECYCLE: 'text-terminal-green',
  AES: 'text-terminal-cyan',
  RSA: 'text-terminal-green',
  DH: 'text-terminal-cyan',
  OTP: 'text-terminal-green',
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleTimeString(undefined, { hour12: false });
};

const CryptoLogPanel: React.FC<CryptoLogPanelProps> = ({ title, sources, autoRefreshMs = 5000 }) => {
  const queryKey = ['crypto-logs', ...(sources ?? [])];
  const { data, isLoading, error, refetch, isFetching } = useQuery<KeyEventRecord[]>({
    queryKey,
    queryFn: () => fetchCryptoLogs(sources),
    refetchInterval: autoRefreshMs,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
          {sources && (
            <p className="text-xs text-muted-foreground">Sources: {sources.join(', ')}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading cryptographic events…</p>}
      {error && <p className="text-xs text-destructive">Unable to load logs.</p>}

      <ScrollArea className="max-h-64">
        <div className="space-y-2">
          {(data ?? []).map((entry) => (
            <div key={entry.id} className="rounded border border-terminal-green/20 p-2 bg-black/20 hover:bg-black/30 transition-colors">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className={`${sourceColors[entry.source] ?? 'text-terminal-green'} font-semibold`}>
                  [{entry.source}] {entry.eventType}
                </span>
                <span className="text-terminal-green/60">{formatTimestamp(entry.createdAt)}</span>
              </div>
              {/* Highlight keys/fingerprints/sessionKeyBase64 if present */}
              {(() => {
                const payload = entry.payload ?? {};
                const key = payload.sessionKeyBase64 || payload.key || payload.fingerprint;
                if (key) {
                  return (
                    <div className="mb-1">
                      <span className="inline-block rounded bg-terminal-green/10 border border-terminal-green/20 text-terminal-green px-1.5 py-0.5 text-[9px] font-mono break-all">
                        {payload.sessionKeyBase64 && 'Session Key: '}
                        {payload.key && 'Key: '}
                        {payload.fingerprint && 'Fingerprint: '}
                        {String(key)}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
              <pre className="text-[9px] leading-tight text-terminal-green/80 whitespace-pre-wrap break-all font-mono">
                {JSON.stringify(entry.payload ?? {}, null, 1)}
              </pre>
            </div>
          ))}
          {!isLoading && data?.length === 0 && (
            <p className="text-[10px] text-terminal-green/60">No events recorded for these sources.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default CryptoLogPanel;
