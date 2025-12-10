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
  PFS: 'text-terminal-amber',
  LIFECYCLE: 'text-primary',
  AES: 'text-accent',
  RSA: 'text-terminal-green',
  DH: 'text-terminal-blue',
  OTP: 'text-terminal-amber',
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
        <div className="space-y-3">
          {(data ?? []).map((entry) => (
            <div key={entry.id} className="rounded border border-border/50 p-3 bg-background/60">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`${sourceColors[entry.source] ?? 'text-muted-foreground'} font-semibold`}>
                  [{entry.source}] {entry.eventType}
                </span>
                <span className="text-muted-foreground">{formatTimestamp(entry.createdAt)}</span>
              </div>
              <pre className="text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(entry.payload ?? {}, null, 2)}
              </pre>
            </div>
          ))}
          {!isLoading && data?.length === 0 && (
            <p className="text-xs text-muted-foreground">No events recorded for these sources.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default CryptoLogPanel;
