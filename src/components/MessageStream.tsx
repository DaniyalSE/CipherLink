/**
 * Message Stream Component
 * 
 * Displays chat messages in a terminal-style scrolling view.
 * Features typewriter animations for incoming messages.
 */

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChatMessage } from '@/lib/socket';
import { Shield, ShieldOff, ShieldCheck, Hash, KeyRound } from 'lucide-react';

interface MessageStreamProps {
  messages: ChatMessage[];
}

const MessageStream: React.FC<MessageStreamProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 terminal-body"
      role="log"
      aria-label="Message stream"
    >
      {messages.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">No messages yet.</p>
          <p className="text-xs mt-2">Type a message or use /help for commands.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((message, index) => (
            <MessageLine 
              key={message.id} 
              message={message} 
              isNew={index === messages.length - 1}
            />
          ))}
        </div>
      )}
      
      {/* Cursor at end */}
      <div className="flex items-center mt-2">
        <span className="text-primary">▊</span>
        <span className="cursor-blink text-primary ml-1">_</span>
      </div>
    </div>
  );
};

interface MessageLineProps {
  message: ChatMessage;
  isNew: boolean;
}

const MessageLine: React.FC<MessageLineProps> = ({ message, isNew }) => {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(isNew && message.type === 'incoming');

  useEffect(() => {
    if (isTyping) {
      let index = 0;
      const text = message.body;
      const interval = setInterval(() => {
        if (index <= text.length) {
          setDisplayText(text.slice(0, index));
          index++;
        } else {
          setIsTyping(false);
          clearInterval(interval);
        }
      }, 20);
      return () => clearInterval(interval);
    } else {
      setDisplayText(message.body);
    }
  }, [message.body, isTyping]);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getSignatureIcon = () => {
    if (!message.signed) return null;
    
    switch (message.signatureStatus) {
      case 'valid':
        return <span title="Valid signature"><ShieldCheck className="w-3 h-3 text-primary" /></span>;
      case 'invalid':
        return <span title="Invalid signature"><ShieldOff className="w-3 h-3 text-destructive" /></span>;
      default:
        return <span title="Unsigned"><Shield className="w-3 h-3 text-muted-foreground" /></span>;
    }
  };

  const getEncryptionBadge = () => {
    if (message.type === 'system') return null;
    if (message.sessionKeyFingerprint) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary"
          title={`Session key fingerprint: ${message.sessionKeyFingerprint}`}
        >
          <KeyRound className="w-3 h-3" />
          {message.sessionKeyFingerprint.slice(0, 16)}
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
        title="Broadcast channel uses shared workspace key"
      >
        <KeyRound className="w-3 h-3" />
        GLOBAL AES
      </span>
    );
  };

  const messageClasses = {
    incoming: 'message-incoming',
    outgoing: 'message-outgoing',
    system: 'terminal-system',
  };

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      className={`flex flex-col ${messageClasses[message.type]}`}
    >
      {/* Message header */}
      <div className="flex items-center gap-2 text-xs mb-1">
        <span className="text-muted-foreground">[{formatTime(message.timestamp)}]</span>
        <span className={`font-medium ${
          message.type === 'system' ? 'text-terminal-amber' :
          message.type === 'outgoing' ? 'text-primary' :
          'text-accent'
        }`}>
          {message.type === 'system' ? 'SYSTEM' : message.from}
        </span>
        {message.to !== 'all' && message.type !== 'system' && (
          <span className="text-muted-foreground">→ {message.to}</span>
        )}
        {getSignatureIcon()}
        {getEncryptionBadge()}
        {message.hash && (
          <span className="flex items-center gap-1 text-muted-foreground" title={`Hash: ${message.hash}`}>
            <Hash className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Message body */}
      <div className={`font-mono ${message.type === 'system' ? 'text-terminal-amber' : 'terminal-text'}`}>
        <span className="text-muted-foreground mr-2">{'>'}</span>
        <span className="whitespace-pre-wrap break-words">{displayText}</span>
        {isTyping && <span className="cursor-blink">▊</span>}
      </div>
    </motion.div>
  );
};

export default MessageStream;
