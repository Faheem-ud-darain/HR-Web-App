import type { ChangelogEntry } from '@/lib/core/changelog';

// What's new in the app, newest first. Add an entry at the TOP with each release worth telling people about: it shows once as a
// popup the next time each person opens the app, and stays on the changelog page (Profile -> What's New).
// Keep them to things people can see and use. Never write about pay, payroll rules, security or other behind-the-scenes changes:
// the page is open to anyone with the link.
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-announcement-read-more',
    when: 'October 2026',
    title: 'Long announcements, tidied up',
    summary: 'Long announcements are cut short on the card. Tap Read more to open the whole text in a popup.',
    preview: 'readmore',
    details: [
      'Announcements keep an even size, however long the text is.',
      'Read more opens the complete announcement in a popup, with its title.',
      'On a phone the latest announcements are a stack of cards you swipe through.',
    ],
  },
  {
    id: '2026-10-leave-date-changes',
    when: 'October 2026',
    title: 'Change your leave dates in the app',
    summary: 'Need other days for a leave you already requested? Ask for the change here and HR or Admin answers it.',
    preview: 'dates',
    details: [
      'On My Leaves, choose Change dates on a leave that has not started yet.',
      'Your original dates stay in place until the request is approved.',
      'When it is approved the dates update on their own and you are told.',
      'You can withdraw a request while it is waiting.',
    ],
  },
  {
    id: '2026-10-card-stacks',
    when: 'October 2026',
    title: 'Swipe through requests on your phone',
    summary: 'Leave requests and date changes come as a stack of cards: swipe down for the next, up for the one before.',
    preview: 'stack',
    details: [
      'The top card is whole and the next ones peek out above it.',
      'Swipe down for the next request and up to go back; the arrows do the same.',
      'It goes round at both ends, so you never hit a dead end.',
      'Used on the Admin and HR leave screens, and for announcements.',
    ],
  },
];

/** The newest entry's id: what a person has "seen up to" once they close the popup. */
export const LATEST_CHANGELOG_ID = CHANGELOG[0].id;
