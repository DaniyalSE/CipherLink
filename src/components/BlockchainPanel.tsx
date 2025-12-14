import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBlockchain, BlockchainBlock } from '@/lib/blockchain-chain';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

const BlockchainPanel: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery<BlockchainBlock[]>({
    queryKey: ['blockchain-chain'],
    queryFn: fetchBlockchain,
    refetchInterval: 10000,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wide text-foreground">Blockchain (Audit Log)</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading blockchain…</p>}
      {error && <p className="text-xs text-destructive">Unable to load blockchain.</p>}
      {!isLoading && !error && (
        <ScrollArea className="h-[400px] w-full border rounded-md">
          <div className="space-y-3 p-4">
          {(data ?? []).map((block) => (
            <div key={block.hash} className="rounded border border-border/50 p-3 bg-background/60">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-terminal-cyan">Block #{block.height}</span>
                <span className="text-muted-foreground">{new Date(block.created_at).toLocaleTimeString(undefined, { hour12: false })}</span>
              </div>
              <div className="text-[11px] leading-tight text-muted-foreground break-all">
                <div><strong>Hash:</strong> {block.hash}</div>
                <div><strong>Prev:</strong> {block.previous_hash || 'GENESIS'}</div>
                <div><strong>Nonce:</strong> {block.nonce} <strong>Diff:</strong> {block.difficulty}</div>
                <div><strong>MsgHash:</strong> {block.message_hash}</div>
                {block.payload && <div><strong>Payload:</strong> <pre className="inline whitespace-pre-wrap">{block.payload}</pre></div>}
              </div>
            </div>
          ))}
          {!isLoading && data?.length === 0 && (
            <p className="text-xs text-muted-foreground">No blocks in the chain.</p>
          )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default BlockchainPanel;
