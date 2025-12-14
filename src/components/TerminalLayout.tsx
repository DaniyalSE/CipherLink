/**
 * Terminal Layout Component
 * 
 * Main layout for the authenticated terminal interface.
 * Contains the message stream, sidebar navigation, and panels.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Terminal, Users, Settings, Bug, LogOut, 
  Wifi, WifiOff, Key, Hash, Send 
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { socketManager, ChatMessage, ConnectionStatus, type CryptoStageSocketEvent } from '@/lib/socket';
import { generateKeypair, type ContactRecord } from '@/lib/api';
import ChatInput from '@/components/ChatInput';
import ContactsPanel from '@/components/ContactsPanel';
import DebugLogPanel from '@/components/DebugLogPanel';
import SettingsPanel from '@/components/SettingsPanel';
import MessageStream from '@/components/MessageStream';
import SecurityPanels from '@/components/SecurityPanels';
import BlockchainPanel from '@/components/BlockchainPanel';
import BlockchainIntegrityPanel from '@/components/BlockchainIntegrityPanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useContacts } from '@/hooks/use-contacts';

type ActivePanel = 'chat' | 'contacts' | 'settings' | 'debug';

interface IncomingNotification {
  id: string;
  from: string;
  body: string;
  contactLinkId?: string | null;
}

const formatStageEvent = (event: CryptoStageSocketEvent): string => {
  const entries = Object.entries(event.payload || {});
  const preview = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');
  return `[${event.type}] ${preview || 'awaiting data'}`;
};

const TerminalLayout: React.FC = () => {
  const [activePanel, setActivePanel] = useState<ActivePanel>('chat');
  const [globalMessages, setGlobalMessages] = useState<ChatMessage[]>([]);
  const [channelMessages, setChannelMessages] = useState<Record<string, ChatMessage[]>>({});
  const [notifications, setNotifications] = useState<IncomingNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [activeContact, setActiveContact] = useState<ContactRecord | null>(null);
  const [keypairFingerprint, setKeypairFingerprint] = useState<string | null>(null);
  const { contacts, isLoading: contactsLoading, error: contactError, refresh, addContactByEmail } = useContacts();
  
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  const notificationTimeouts = useRef<Record<string, number>>({});

  const createSystemMessage = (body: string): ChatMessage => ({
    id: `sys_${Date.now()}`,
    from: 'system',
    to: 'you',
    body,
    timestamp: new Date(),
    type: 'system',
  });

  const appendGlobalMessage = useCallback((message: ChatMessage) => {
    setGlobalMessages(prev => [...prev, message]);
  }, []);

  const appendChannelMessage = useCallback((contactId: string, message: ChatMessage) => {
    setChannelMessages(prev => ({
      ...prev,
      [contactId]: [...(prev[contactId] ?? []), message],
    }));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(note => note.id !== id));
    const timeoutId = notificationTimeouts.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete notificationTimeouts.current[id];
    }
  }, []);

  const activeChannelId = activeContact?.linkId ?? null;
  const currentMessages = useMemo(() => {
    if (activeChannelId) {
      return channelMessages[activeChannelId] ?? [];
    }
    return globalMessages;
  }, [activeChannelId, channelMessages, globalMessages]);

  const showIncomingToast = useCallback((message: ChatMessage) => {
    if (message.type !== 'incoming' || message.from === 'system') {
      return;
    }
    const preview = message.body.length > 160 ? `${message.body.slice(0, 157)}...` : message.body;
    toast({
      title: `New message from ${message.from}`,
      description: preview,
    });

    const notificationId = `incoming_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setNotifications(prev => [...prev, {
      id: notificationId,
      from: message.from,
      body: preview,
      contactLinkId: message.contactLinkId,
    }]);

    const timeoutId = window.setTimeout(() => dismissNotification(notificationId), 6000);
    notificationTimeouts.current[notificationId] = timeoutId;
  }, [dismissNotification, toast]);

  useEffect(() => {
    socketManager.setCurrentUser(user?.id ?? null);
  }, [user]);

  useEffect(() => {
    return () => {
      Object.values(notificationTimeouts.current).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      notificationTimeouts.current = {};
    };
  }, []);

  useEffect(() => {
    if (!activeContact) return;
    const match = contacts.find(contact => contact.linkId === activeContact.linkId);
    if (!match) {
      setActiveContact(null);
      return;
    }
    if (match !== activeContact) {
      setActiveContact(match);
    }
  }, [contacts, activeContact]);

  // Connect to socket on mount
  useEffect(() => {
    socketManager.connect();

    const unsubMessage = socketManager.onMessage((message) => {
      if (message.contactLinkId) {
        appendChannelMessage(message.contactLinkId, message);
      } else {
        appendGlobalMessage(message);
      }

      if (message.contactLinkId) {
        showIncomingToast(message);
      }
    });

    const unsubStatus = socketManager.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const unsubStage = socketManager.onCryptoStage((event) => {
      appendGlobalMessage({
        id: `stage_${event.type}_${Date.now()}`,
        from: 'system',
        to: 'you',
        body: formatStageEvent(event),
        timestamp: new Date(),
        type: 'system',
      });
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubStage();
      socketManager.disconnect();
    };
  }, [appendChannelMessage, appendGlobalMessage, showIncomingToast]);

  // Add system welcome message
  useEffect(() => {
    const welcomeMessage: ChatMessage = {
      id: 'system_welcome',
      from: 'system',
      to: 'all',
      body: `Welcome to SecureTerminal, ${user?.displayName || 'user'}. Type /help for available commands.`,
      timestamp: new Date(),
      type: 'system',
    };
    setGlobalMessages([welcomeMessage]);
  }, [user]);

  const handleSendMessage = (body: string): boolean => {
    if (body.startsWith('/')) {
      handleCommand(body);
      return true;
    }

    if (!activeContact) {
      toast({
        title: 'Select a Contact',
        description: 'Global terminal is read-only. Choose a contact to send encrypted messages.',
      });
      return false;
    }

    const recipient = activeContact.peer.id;
    const metadata = { contact_link_id: activeContact.linkId };
    void socketManager.sendMessage(recipient, body, metadata);
    return true;
  };

  const handleCommand = (command: string) => {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const pushSystem = (body: string) => appendGlobalMessage(createSystemMessage(body));

    switch (cmd) {
      case 'help':
        pushSystem(`Available commands:
/whoami - Display current user info
/generate-key - Generate a new keypair (server-side)
/hash <message> - Calculate SHA-256 hash of message
/clear - Clear message history
/ping - Test connection latency
/status - Show connection status`);
        break;

      case 'whoami':
        pushSystem(`User: ${user?.displayName || 'anonymous'}
Email: ${user?.email || 'unknown'}
ID: ${user?.id || 'N/A'}
Session: Active
Keypair: ${keypairFingerprint || 'Not generated'}`);
        break;

      case 'generate-key':
        handleGenerateKeypair();
        break;

      case 'hash':
        if (args) {
          crypto.subtle.digest('SHA-256', new TextEncoder().encode(args))
            .then(buffer => {
              const hash = Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
              pushSystem(`SHA-256: ${hash}`);
            });
        } else {
          pushSystem('Usage: /hash <message>');
        }
        break;

      case 'clear':
        if (activeContact) {
          setChannelMessages(prev => ({
            ...prev,
            [activeContact.linkId]: [],
          }));
          toast({
            title: 'Chat Cleared',
            description: `Removed local history with ${activeContact.peer.displayName}.`,
          });
        } else {
          setGlobalMessages([]);
          toast({
            title: 'Global Feed Cleared',
            description: 'Encryption logs and system messages have been cleared.',
          });
        }
        break;

      case 'ping':
        socketManager.ping();
        break;

      case 'status':
        pushSystem(`Connection: ${connectionStatus}
Protocol: WebSocket (encrypted)
Mock Mode: ${import.meta.env.VITE_MOCK_MODE === 'true' ? 'Active' : 'Disabled'}`);
        break;

      default:
        pushSystem(`Unknown command: ${cmd}. Type /help for available commands.`);
    }
  };

  const handleGenerateKeypair = async () => {
    const loadingMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      from: 'system',
      to: 'you',
      body: 'Generating keypair on server...',
      timestamp: new Date(),
      type: 'system',
    };
    appendGlobalMessage(loadingMsg);

    try {
      const keypair = await generateKeypair();
      setKeypairFingerprint(keypair.publicKeyFingerprint);
      
      appendGlobalMessage({
        id: `sys_${Date.now()}`,
        from: 'system',
        to: 'you',
        body: `Keypair generated successfully!
Fingerprint: ${keypair.publicKeyFingerprint}
⚠ Private key stored server-side only.`,
        timestamp: new Date(),
        type: 'system',
      });

      toast({
        title: 'Keypair Generated',
        description: 'Your public key fingerprint has been updated.',
      });
    } catch (error) {
      appendGlobalMessage({
        id: `sys_${Date.now()}`,
        from: 'system',
        to: 'you',
        body: 'Error generating keypair. Please try again.',
        timestamp: new Date(),
        type: 'system',
      });
    }
  };

  const handleLogout = () => {
    socketManager.disconnect();
    logout();
    navigate('/auth');
    toast({
      title: 'Session Terminated',
      description: 'You have been logged out.',
    });
  };

  const handleSelectContact = (contact: ContactRecord) => {
    setActiveContact(contact);
    setActivePanel('chat');
    socketManager.joinContact(contact.linkId);
    toast({
      title: 'Channel Opened',
      description: `Private channel with ${contact.peer.displayName}`,
    });
  };

  const handleLeaveChannel = () => {
    setActiveContact(null);
    socketManager.joinGlobal();
    toast({
      title: 'Channel Closed',
      description: 'Returned to global terminal feed.',
    });
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-50 w-full max-w-xs space-y-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="pointer-events-auto bg-card border border-border rounded-lg shadow-lg p-4"
            >
              <div className="text-xs text-muted-foreground uppercase">Incoming message</div>
              <div className="text-sm font-semibold text-foreground">{note.from}</div>
              <p className="text-sm text-muted-foreground mt-1 break-words">{note.body}</p>
              <div className="flex justify-end gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissNotification(note.id)}
                >
                  Dismiss
                </Button>
                {note.contactLinkId && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const target = contacts.find(contact => contact.linkId === note.contactLinkId);
                      if (target) {
                        handleSelectContact(target);
                      }
                      dismissNotification(note.id);
                    }}
                  >
                    Open Chat
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className={`min-h-screen bg-background flex ${settings.crtEffect ? 'crt-lines' : ''}`}>
      {/* Sidebar */}
      <aside className="w-16 md:w-64 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Terminal className="w-8 h-8 text-primary" />
            <span className="hidden md:block font-bold text-foreground">SecureTerminal</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <NavItem
            icon={Terminal}
            label="Terminal"
            active={activePanel === 'chat'}
            onClick={() => setActivePanel('chat')}
          />
          <NavItem
            icon={Users}
            label="Contacts"
            active={activePanel === 'contacts'}
            onClick={() => setActivePanel('contacts')}
          />
          <NavItem
            icon={Bug}
            label="Debug"
            active={activePanel === 'debug'}
            onClick={() => setActivePanel('debug')}
          />
          <NavItem
            icon={Settings}
            label="Settings"
            active={activePanel === 'settings'}
            onClick={() => setActivePanel('settings')}
          />
        </nav>

        {/* User info & logout */}
        <div className="p-4 border-t border-border">
          <div className="hidden md:block mb-3">
            <p className="text-sm text-foreground truncate">{user?.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Header bar */}
        <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium text-foreground capitalize">
              {activePanel === 'chat'
                ? (activeContact ? `@${activeContact.peer.displayName}` : 'Global Terminal')
                : activePanel}
            </h2>
            {activeContact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLeaveChannel}
                className="text-xs text-muted-foreground"
              >
                Leave Channel
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-2 text-sm">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-4 h-4 text-primary" />
              ) : connectionStatus === 'connecting' ? (
                <Wifi className="w-4 h-4 text-terminal-amber animate-pulse" />
              ) : (
                <WifiOff className="w-4 h-4 text-destructive" />
              )}
              <span className={`hidden sm:inline text-xs ${
                connectionStatus === 'connected' ? 'text-primary' :
                connectionStatus === 'connecting' ? 'text-terminal-amber' :
                'text-destructive'
              }`}>
                {connectionStatus.toUpperCase()}
              </span>
            </div>

            {/* Keypair status */}
            {keypairFingerprint && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Key className="w-3 h-3" />
                <span className="hidden sm:inline truncate max-w-[100px]">
                  {keypairFingerprint.slice(0, 16)}...
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activePanel === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <MessageStream messages={currentMessages} />
                <ChatInput
                  onSend={handleSendMessage}
                  channelActive={Boolean(activeContact)}
                  readOnlyNotice={!activeContact ? 'Global terminal displays encryption logs and system notifications. Select a contact to send private messages.' : undefined}
                />
              </motion.div>
            )}

            {activePanel === 'contacts' && (
              <motion.div
                key="contacts"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <ContactsPanel
                  contacts={contacts}
                  isLoading={contactsLoading}
                  error={contactError}
                  onRefresh={refresh}
                  onAddContact={addContactByEmail}
                  onSelectContact={handleSelectContact}
                  activeContactId={activeContact?.linkId}
                />
              </motion.div>
            )}

            {activePanel === 'debug' && (
              <motion.div
                key="debug"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <div className="h-full grid gap-4 lg:grid-cols-4">
                  <SecurityPanels />
                  <DebugLogPanel />
                  <BlockchainPanel />
                  <BlockchainIntegrityPanel />
                </div>
              import BlockchainIntegrityPanel from '@/components/BlockchainIntegrityPanel';
              </motion.div>
            )}

            {activePanel === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full overflow-auto"
              >
                <SettingsPanel onGenerateKeypair={handleGenerateKeypair} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
    </>
  );
};

// Navigation item component
interface NavItemProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`sidebar-item w-full ${active ? 'active' : ''}`}
    aria-label={label}
  >
    <Icon className="w-5 h-5" />
    <span className="hidden md:inline">{label}</span>
  </button>
);

export default TerminalLayout;
