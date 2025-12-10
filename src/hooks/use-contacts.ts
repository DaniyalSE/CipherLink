/**
 * Contact synchronization hook.
 *
 * Keeps the local contact list in sync with the backend and socket events,
 * ensuring session keys are ready for per-contact encryption as soon as
 * possible, even when the contacts panel is not visible.
 */

import { useState, useEffect, useCallback } from 'react';
import { getContacts, addContact, type ContactRecord } from '@/lib/api';
import { socketManager, type PresenceUpdate } from '@/lib/socket';

const upsertContact = (list: ContactRecord[], incoming: ContactRecord): ContactRecord[] => {
  const index = list.findIndex(contact => contact.linkId === incoming.linkId);
  if (index === -1) {
    return [incoming, ...list];
  }
  const clone = [...list];
  clone[index] = incoming;
  return clone;
};

const applyPresence = (list: ContactRecord[], update: PresenceUpdate): ContactRecord[] =>
  list.map(contact =>
    contact.peer.id === update.userId
      ? {
          ...contact,
          online: update.online,
          peer: { ...contact.peer, displayName: update.displayName },
        }
      : contact,
  );

export interface UseContactsResult {
  contacts: ContactRecord[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addContactByEmail: (email: string) => Promise<ContactRecord>;
}

export const useContacts = (): UseContactsResult => {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const registerKeys = useCallback((items: ContactRecord[]) => {
    if (items.length > 0) {
      socketManager.registerContactSessions(items);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getContacts();
      setContacts(data);
      registerKeys(data);
    } catch (err) {
      console.error('Failed to load contacts', err);
      setError('Unable to load contacts');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [registerKeys]);

  const addContactByEmail = useCallback(
    async (email: string) => {
      const contact = await addContact(email);
      setContacts(prev => upsertContact(prev, contact));
      registerKeys([contact]);
      return contact;
    },
    [registerKeys],
  );

  useEffect(() => {
    let mounted = true;
    refresh().catch(() => {
      if (mounted) {
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    const unsubscribePresence = socketManager.onPresence((update: PresenceUpdate) => {
      setContacts(prev => applyPresence(prev, update));
    });
    const unsubscribeContact = socketManager.onContactUpdate((contact: ContactRecord) => {
      registerKeys([contact]);
      setContacts(prev => upsertContact(prev, contact));
    });
    return () => {
      unsubscribePresence();
      unsubscribeContact();
    };
  }, [registerKeys]);

  return { contacts, isLoading, error, refresh, addContactByEmail };
};

