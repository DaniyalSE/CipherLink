/**
 * Debug Log Panel Component
 * 
 * Displays raw network events, WebSocket messages, and system logs.
 * Useful for debugging and monitoring the connection.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Bug, Trash2, Download, Pause, Play, 
  Wifi, WifiOff, MessageSquare, Users, AlertCircle, Activity 
} from 'lucide-react';
import { socketManager, DebugLog } from '@/lib/socket';
import { Button } from '@/components/ui/button';

const DebugLogPanel: React.FC = () => {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<DebugLog['type'] | 'all'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to debug logs
  useEffect(() => {
    const unsubscribe = socketManager.onDebug((log) => {
      if (!isPaused) {
        setLogs(prev => [...prev.slice(-99), log]); // Keep last 100 logs
      }
    });
    return unsubscribe;
  }, [isPaused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const clearLogs = () => setLogs([]);

  const downloadLogs = () => {
    const content = logs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.data}${
        log.raw ? '\n  ' + JSON.stringify(log.raw, null, 2) : ''
      }`
    ).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-debug-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.type === filter);

  const getLogIcon = (type: DebugLog['type']) => {
    switch (type) {
      case 'connect':
        return <Wifi className="w-3 h-3 text-primary" />;
      case 'disconnect':
        return <WifiOff className="w-3 h-3 text-destructive" />;
      case 'message':
        return <MessageSquare className="w-3 h-3 text-accent" />;
      case 'presence':
        return <Users className="w-3 h-3 text-terminal-cyan" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-destructive" />;
      case 'ping':
        return <Activity className="w-3 h-3 text-terminal-green" />;
      case 'system':
        return <Bug className="w-3 h-3 text-muted-foreground" />;
      default:
        return <Bug className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getLogColor = (type: DebugLog['type']) => {
    switch (type) {
      case 'connect':
        return 'text-terminal-green';
      case 'disconnect':
        return 'text-destructive';
      case 'error':
        return 'text-destructive';
      case 'message':
        return 'text-terminal-cyan';
      case 'presence':
        return 'text-terminal-cyan';
      case 'ping':
        return 'text-terminal-green';
      case 'system':
        return 'text-terminal-green';
      default:
        return 'text-terminal-green';
    }
  };

  const filterOptions: Array<{ value: DebugLog['type'] | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'connect', label: 'Connect' },
    { value: 'disconnect', label: 'Disconnect' },
    { value: 'message', label: 'Messages' },
    { value: 'presence', label: 'Presence' },
    { value: 'ping', label: 'Ping' },
    { value: 'error', label: 'Errors' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold terminal-text">Debug Logs</h3>
          <span className="text-xs text-muted-foreground">
            ({filteredLogs.length} entries)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className={isPaused ? 'text-terminal-green' : 'text-muted-foreground'}
            title={isPaused ? 'Resume logging' : 'Pause logging'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadLogs}
            className="text-muted-foreground"
            title="Download logs"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="text-muted-foreground hover:text-destructive"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-4 p-1 bg-secondary/30 rounded-lg">
        {filterOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              filter === value 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Paused indicator */}
      {isPaused && (
        <div className="mb-2 p-1.5 bg-terminal-green/10 border border-terminal-green/30 rounded text-[10px] text-terminal-green text-center">
          ⏸ Logging paused - new events will not be captured
        </div>
      )}

      {/* Log stream */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto terminal-body rounded-lg p-2 font-mono text-[10px] leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-terminal-green/60">
            <Bug className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-[10px]">No logs yet</p>
            <p className="text-[9px] mt-1 text-terminal-green/40">Events will appear here in real-time</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="group hover:bg-terminal-green/5 transition-colors rounded px-1 py-0.5"
              >
                <div className="flex items-start gap-1.5 flex-wrap">
                  {/* Timestamp - compact format */}
                  <span className="text-terminal-green/70 whitespace-nowrap text-[9px]">
                    {log.timestamp.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </span>

                  {/* Type label - compact */}
                  <span className={`uppercase font-semibold ${getLogColor(log.type)} text-[9px] tracking-wide`}>
                    {log.type}
                  </span>

                  {/* Data - terminal green */}
                  <span className="text-terminal-green/90 break-all flex-1 min-w-0">{log.data}</span>
                </div>

                {/* Raw data (expandable) - more compact */}
                {log.raw && (
                  <details className="ml-0 mt-0.5 text-terminal-green/60">
                    <summary className="cursor-pointer hover:text-terminal-green text-[9px]">
                      [raw]
                    </summary>
                    <pre className="mt-1 p-1.5 bg-black/30 border border-terminal-green/20 rounded text-[9px] overflow-x-auto text-terminal-green/80 font-mono">
                      {JSON.stringify(log.raw, null, 1)}
                    </pre>
                  </details>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
        <span>Total events: {logs.length}</span>
        <span>
          Errors: {logs.filter(l => l.type === 'error').length} | 
          Messages: {logs.filter(l => l.type === 'message').length}
        </span>
      </div>
    </div>
  );
};

export default DebugLogPanel;
