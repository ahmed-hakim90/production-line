import React, { useEffect, useRef } from 'react';
import type { AppNotification } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';

const notificationKey = (n: AppNotification): string => {
  const t = n.createdAt?.toDate ? n.createdAt.toDate().getTime() : new Date(n.createdAt || 0).getTime() || 0;
  return n.id || `${n.type}|${n.referenceId || ''}|${n.title}|${t}`;
};

const toTimestamp = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const NotificationPopupOverlay: React.FC = () => {
  const notifications = useAppStore((s) => s.notifications);
  const currentEmployeeId = useAppStore((s) => s.currentEmployee?.id || '');
  const { openModal, hasModalTarget } = useGlobalModalManager();
  const initializedRef = useRef(false);
  const knownKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    initializedRef.current = false;
    knownKeysRef.current = new Set();
  }, [currentEmployeeId]);

  useEffect(() => {
    const sorted = [...notifications].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

    if (!initializedRef.current) {
      initializedRef.current = true;
      knownKeysRef.current = new Set(sorted.map(notificationKey));
      return;
    }

    const incoming = sorted.filter((n) => {
      const key = notificationKey(n);
      return !knownKeysRef.current.has(key) && !n.isRead;
    });

    if (incoming.length === 0) return;

    const nextKnown = new Set(knownKeysRef.current);
    sorted.forEach((n) => nextKnown.add(notificationKey(n)));
    knownKeysRef.current = nextKnown;

    incoming.forEach((notification) => {
      if (!currentEmployeeId) return;
      if (String(notification.recipientId || '') !== currentEmployeeId) return;
      if (!hasModalTarget(MODAL_KEYS.DAILY_WELCOME)) return;
      openModal(MODAL_KEYS.DAILY_WELCOME, {
        source: 'notification',
        notification,
      });
    });
  }, [notifications, hasModalTarget, openModal, currentEmployeeId]);

  return null;
};
