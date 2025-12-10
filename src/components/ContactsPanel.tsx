/**
 * Contacts Panel Component
 * 
 * Displays a list of users with their online status.
 * Allows selecting a contact for private messaging.
 */

import React, { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { User, Circle, Search, RefreshCw, Key } from 'lucide-react';
import { type ContactRecord } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ContactsPanelProps {
  contacts: ContactRecord[];
  isLoading: boolean;
  error?: string | null;
  onRefresh: () => Promise<void> | void;
  onAddContact: (email: string) => Promise<ContactRecord>;
  onSelectContact: (contact: ContactRecord) => void;
  activeContactId?: string | null;
}

const ContactsPanel: React.FC<ContactsPanelProps> = ({
  contacts,
  isLoading,
  error,
  onRefresh,
  onAddContact,
  onSelectContact,
  activeContactId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleRefresh = () => {
    Promise.resolve(onRefresh())
      .catch((err) => {
        console.error('Failed to refresh contacts:', err);
        toast({
          title: 'Sync Failed',
          description: 'Could not load contacts. Please retry.',
          variant: 'destructive',
        });
      });
  };

  const handleAddContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!newContactEmail.trim()) return;
    try {
      setIsSubmitting(true);
      const contact = await onAddContact(newContactEmail.trim());
      setNewContactEmail('');
      toast({
        title: 'Contact Linked',
        description: `Encrypted session ready with ${contact.peer.displayName}.`,
      });
    } catch (error) {
      console.error('Failed to add contact:', error);
      toast({
        title: 'Unable to add contact',
        description: 'Check the email and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.peer.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.peer.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineContacts = filteredContacts.filter(c => c.online);
  const offlineContacts = filteredContacts.filter(c => !c.online);

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold terminal-text">Contacts</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="text-muted-foreground"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-input"
        />
      </div>

      {/* Contacts list */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Online section */}
        {onlineContacts.length > 0 && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Online ({onlineContacts.length})
            </h4>
            <div className="space-y-1">
              {onlineContacts.map((contact, index) => (
                <ContactItem
                  key={contact.linkId}
                  contact={contact}
                  onClick={() => onSelectContact(contact)}
                  isActive={activeContactId === contact.linkId}
                  delay={index * 0.05}
                />
              ))}
            </div>
          </div>
        )}

        {/* Offline section */}
        {offlineContacts.length > 0 && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Offline ({offlineContacts.length})
            </h4>
            <div className="space-y-1">
              {offlineContacts.map((contact, index) => (
                <ContactItem
                  key={contact.linkId}
                  contact={contact}
                  onClick={() => onSelectContact(contact)}
                  isActive={activeContactId === contact.linkId}
                  delay={index * 0.05}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {filteredContacts.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No contacts found</p>
            {error && <p className="text-xs mt-2 text-destructive">{error}</p>}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
            <p className="text-sm">Loading contacts...</p>
          </div>
        )}
      </div>

      {/* Add contact */}
      <form onSubmit={handleAddContact} className="mt-4 flex gap-2">
        <Input
          type="email"
          placeholder="Add contact by email"
          value={newContactEmail}
          onChange={(e) => setNewContactEmail(e.target.value)}
          disabled={isLoading || isSubmitting}
          className="bg-input"
          required
        />
        <Button type="submit" size="sm" disabled={isLoading || isSubmitting}>
          Link
        </Button>
      </form>

      {/* Stats footer */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Total: {contacts.length}</span>
          <span className="flex items-center gap-1">
            <Circle className="w-2 h-2 fill-primary text-primary" />
            Online: {contacts.filter(c => c.online).length}
          </span>
        </div>
      </div>
    </div>
  );
};

interface ContactItemProps {
  contact: ContactRecord;
  onClick: () => void;
  delay: number;
  isActive?: boolean;
}

const ContactItem: React.FC<ContactItemProps> = ({ contact, onClick, delay, isActive }) => (
  <motion.button
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left group ${
      isActive ? 'bg-primary/10 border border-primary/40' : 'bg-secondary/30 hover:bg-secondary/60'
    }`}
  >
    {/* Avatar */}
    <div className="relative">
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground font-bold">
        {contact.peer.displayName.charAt(0).toUpperCase()}
      </div>
      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
        contact.online ? 'bg-primary status-online' : 'bg-muted-foreground'
      }`} />
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
        @{contact.peer.displayName}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {contact.peer.email}
      </p>
      <p className="text-[10px] text-terminal-amber flex items-center gap-1 truncate mt-1">
        <Key className="w-3 h-3" />
        {(contact.sessionKeyFingerprint || 'unknown').slice(0, 16)}
      </p>
    </div>

    {/* Status indicator */}
    <div className={`text-xs ${contact.online ? 'text-primary' : 'text-muted-foreground'}`}>
      {contact.online ? 'ONLINE' : 'OFFLINE'}
    </div>
  </motion.button>
);

export default ContactsPanel;
