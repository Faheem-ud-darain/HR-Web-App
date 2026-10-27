'use client';

import { useState } from 'react';
import type { Message, Profile } from '@/lib/hrData';
import { attachmentKind, normEmail, sizeBucket, type FileTypeFilter, type SizeFilter } from './chatHelpers';

// The search & filter bar above a channel's messages: text, date range, file type and size.
export function useChatFilters(messages: Message[], emailToProfile: Map<string, Profile>) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');

  const hasActiveFilters = !!(searchQuery || dateFrom || dateTo || fileTypeFilter !== 'all' || sizeFilter !== 'all');

  const filteredMessages = messages.filter(m => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const senderMatch = m.senderName.toLowerCase().includes(q) || emailToProfile.get(normEmail(m.senderEmail))?.alias?.toLowerCase().includes(q);
      const textMatch = (m.text || '').toLowerCase().includes(q);
      const fileMatch = (m.attachmentName || '').toLowerCase().includes(q);
      if (!senderMatch && !textMatch && !fileMatch) return false;
    }
    if (dateFrom && new Date(m.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(m.timestamp) > new Date(`${dateTo}T23:59:59`)) return false;
    if (fileTypeFilter === 'announcement' && !m.isAnnouncement) return false;
    if (fileTypeFilter !== 'all' && fileTypeFilter !== 'announcement' && attachmentKind(m.attachmentName) !== fileTypeFilter) return false;
    if (sizeFilter !== 'all' && sizeBucket(m.attachmentSize) !== sizeFilter) return false;
    return true;
  });

  const clear = () => {
    setSearchQuery(''); setDateFrom(''); setDateTo(''); setFileTypeFilter('all'); setSizeFilter('all');
  };

  return {
    showFilters, setShowFilters, searchQuery, setSearchQuery, dateFrom, setDateFrom, dateTo, setDateTo,
    fileTypeFilter, setFileTypeFilter, sizeFilter, setSizeFilter, hasActiveFilters, filteredMessages,
    clear,
    // Switching channel starts from a clean filter bar.
    reset: () => { clear(); setShowFilters(false); },
  };
}
