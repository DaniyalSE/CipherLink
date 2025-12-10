/**
 * Chat Input Component
 * 
 * Terminal-style input for sending messages and commands.
 * Supports command suggestions and message preview.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Hash, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { calculateHash, signMessageDemo } from '@/lib/socket';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => boolean;
  channelActive?: boolean;
  readOnlyNotice?: string;
}

const COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/whoami', desc: 'Display current user info' },
  { cmd: '/generate-key', desc: 'Generate keypair (server-side)' },
  { cmd: '/hash', desc: 'Calculate SHA-256 hash' },
  { cmd: '/clear', desc: 'Clear message history' },
  { cmd: '/ping', desc: 'Test connection latency' },
  { cmd: '/status', desc: 'Show connection status' },
];

const ChatInput: React.FC<ChatInputProps> = ({ onSend, channelActive = true, readOnlyNotice }) => {
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [showHashPreview, setShowHashPreview] = useState(false);
  const [previewHash, setPreviewHash] = useState<string | null>(null);
  const [showSignWarning, setShowSignWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const trimmedInput = input.trim();
  const isCommand = trimmedInput.startsWith('/');
  const filteredCommands = COMMANDS.filter(c => 
    input.startsWith('/') && c.cmd.startsWith(input.toLowerCase())
  );
  const sendDisabled = !trimmedInput || (!isCommand && !channelActive);

  // Show command suggestions when typing /
  useEffect(() => {
    setShowCommands(input.startsWith('/') && filteredCommands.length > 0);
  }, [input, filteredCommands.length]);

  // Calculate hash preview
  useEffect(() => {
    if (showHashPreview && input && !input.startsWith('/')) {
      calculateHash(input).then(hash => setPreviewHash(hash));
    } else {
      setPreviewHash(null);
    }
  }, [input, showHashPreview]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const accepted = onSend(input.trim());
    if (accepted !== false) {
      setInput('');
      setShowHashPreview(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && showCommands && filteredCommands.length > 0) {
      e.preventDefault();
      setInput(filteredCommands[0].cmd + ' ');
    }
    if (e.key === 'Escape') {
      setShowCommands(false);
      setShowHashPreview(false);
    }
  };

  const selectCommand = (cmd: string) => {
    setInput(cmd + ' ');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const handleDemoSign = async () => {
    if (!input.trim() || input.startsWith('/') || !channelActive) return;
    
    setShowSignWarning(true);
    setTimeout(() => setShowSignWarning(false), 5000);
    
    const result = await signMessageDemo(input);
    console.warn(result.warning);
    const accepted = onSend(`[DEMO SIGNED] ${input}`);
    if (accepted !== false) {
      setInput('');
    }
  };

  return (
    <div className="border-t border-border bg-card p-4">
      {/* Command suggestions */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mb-3 p-2 bg-secondary rounded-lg"
          >
            <p className="text-xs text-muted-foreground mb-2">Commands (Tab to complete):</p>
            <div className="space-y-1">
              {filteredCommands.map(({ cmd, desc }) => (
                <button
                  key={cmd}
                  onClick={() => selectCommand(cmd)}
                  className="block w-full text-left px-2 py-1 text-sm hover:bg-primary/10 rounded transition-colors"
                >
                  <span className="text-primary font-medium">{cmd}</span>
                  <span className="text-muted-foreground ml-2">- {desc}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {readOnlyNotice && (
        <div className="mb-3 p-2 bg-secondary/40 border border-border/40 rounded text-xs text-muted-foreground">
          {readOnlyNotice}
        </div>
      )}

      {/* Hash preview */}
      <AnimatePresence>
        {showHashPreview && previewHash && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 p-2 bg-secondary rounded-lg overflow-hidden"
          >
            <div className="flex items-center gap-2 text-xs">
              <Hash className="w-3 h-3 text-primary" />
              <span className="text-muted-foreground">SHA-256:</span>
              <code className="text-foreground font-mono text-[10px] break-all">{previewHash}</code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo sign warning */}
      <AnimatePresence>
        {showSignWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 p-2 bg-terminal-amber/10 border border-terminal-amber/30 rounded-lg"
          >
            <div className="flex items-start gap-2 text-xs text-terminal-amber">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                <strong>DEMO ONLY:</strong> Client-side signing is NOT secure for production. 
                Real signatures should use server-side HSM or hardware-backed keys.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        {/* Prompt */}
        <div className="text-primary font-medium whitespace-nowrap text-sm">
          {user?.displayName || 'user'}@terminal:~$
        </div>

        {/* Input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message or /command..."
            className="terminal-input w-full text-sm py-2"
            aria-label="Message input"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Hash preview toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowHashPreview(!showHashPreview)}
            className={`p-2 ${showHashPreview ? 'text-primary' : 'text-muted-foreground'}`}
            title="Toggle hash preview"
          >
            <Hash className="w-4 h-4" />
          </Button>

          {/* Demo sign button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDemoSign}
            disabled={!input.trim() || input.startsWith('/') || !channelActive}
            className="p-2 text-muted-foreground hover:text-terminal-amber"
            title="Demo sign (client-side - NOT SECURE)"
          >
            <Shield className="w-4 h-4" />
          </Button>

          {/* Send button */}
          <Button
            type="submit"
            size="sm"
            disabled={sendDisabled}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
      </form>

      {/* Input hint */}
      <div className="mt-2 text-xs text-muted-foreground">
        Press <kbd className="px-1 py-0.5 bg-secondary rounded text-foreground">Tab</kbd> to autocomplete commands
      </div>
    </div>
  );
};

export default ChatInput;
