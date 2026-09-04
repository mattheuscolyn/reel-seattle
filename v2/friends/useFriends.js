import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import {
  getFriendsSnapshot,
  refreshFriends,
  subscribeFriends,
} from './friendsStore.js';

export function useFriends() {
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState(getFriendsSnapshot);
  const userId = auth.signedIn && auth.user?.id ? auth.user.id : null;

  useEffect(() => subscribeFriends(() => setSnapshot(getFriendsSnapshot())), []);

  useEffect(() => {
    void refreshFriends(userId);
  }, [userId]);

  return {
    ...snapshot,
    signedIn: Boolean(userId),
    refresh: () => refreshFriends(userId),
  };
}
