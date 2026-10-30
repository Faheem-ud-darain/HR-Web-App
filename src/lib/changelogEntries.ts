import type { ChangelogEntry, ChangelogUpdate } from '@/lib/core/changelog';

// What's new in the app, written for employees, newest update first. Add an update at the TOP with each release worth telling
// people about: its entries show once as a popup the next time each employee opens the app, and stay on the changelog page
// (Profile -> What's New). Keep them to things people can see and use. Never write about pay, payroll rules, security or other
// behind-the-scenes changes: the page is open to anyone with the link.
export const CHANGELOG_UPDATES: ChangelogUpdate[] = [
  {
    id: 'update-3',
    name: 'Update 3',
    tagline: 'Leaves and phones',
    when: 'October 30, 2026',
    entries: [
      {
        id: 'leave-date-changes',
        title: 'Change your leave dates in the app',
        summary: 'Need other days for a leave you already requested? Ask for the change here and HR or Admin answers it.',
        preview: 'dates',
        details: [
          'On My Leaves, choose Change dates on a leave that has not started yet.',
          'Your original dates stay in place until the request is approved.',
          'When it is approved the dates update on their own and you are told.',
          'You can withdraw a request while it is waiting.',
          'The same days cannot be requested twice.',
        ],
      },
      {
        id: 'card-stacks',
        title: 'Swipe through cards on your phone',
        summary: 'Announcements now come as a stack of cards: swipe down for the next, up for the one before.',
        preview: 'stack',
        details: [
          'The top card is whole and the next ones peek out above it.',
          'Swipe down for the next and up to go back; the arrows do the same.',
          'It goes round at both ends, so you never hit a dead end.',
        ],
      },
      {
        id: 'announcement-read-more',
        title: 'Long announcements, tidied up',
        summary: 'Long announcements are cut short on the card. Tap Read more to open the whole text in a popup.',
        preview: 'readmore',
        details: [
          'Announcements keep an even size, however long the text is.',
          'Read more opens the complete announcement, with its title.',
        ],
      },
    ],
  },
  {
    id: 'update-2',
    name: 'Update 2',
    tagline: 'A new look',
    when: 'October 29, 2026',
    entries: [
      {
        id: 'new-look',
        title: 'A fresh look and easier navigation',
        summary: 'A new top bar and sidebar, new icons and fonts, and a calmer dark theme make every page easier to find your way around.',
        preview: 'layout',
        details: [
          'A new top bar and sidebar put every page one tap away.',
          'New icons and fonts, with softer borders and rounded corners.',
          'A calmer dark theme, and pages that use the full width of your screen.',
          'Popups open as a bottom sheet on your phone, so they are easy to reach with a thumb.',
        ],
      },
      {
        id: 'new-dashboard',
        title: 'A dashboard made for your day',
        summary: 'Announcements, your team, tasks and leaves are now clear cards, and they fit your phone, tablet and desktop.',
        preview: 'dashboard',
        details: [
          'Company announcements with an unread highlight.',
          'My Team shows your teammates with their profile cards.',
          'Your tasks and leaves a tap away.',
        ],
      },
      {
        id: 'new-profile',
        title: 'A better Profile page',
        summary: 'Your details, pay information and account settings now sit in their own tabs.',
        preview: 'profile',
        details: [
          'Tabs for your details, pay and account.',
          'Add your bank details, including JazzCash and Easypaisa wallets that use a mobile number.',
          'Your documents show how much upload room is left.',
        ],
      },
      {
        id: 'new-landing',
        title: 'A brand-new landing page',
        summary: 'The DelCargo home page has a new design with light and dark themes, plus fresh Careers, Privacy and Support pages.',
        preview: 'landing',
        details: [
          'A new look for the page people see before they sign in.',
          'Switch between light and dark from the top of the page.',
          'Careers, Privacy and Support share the same design.',
        ],
      },
    ],
  },
];

export const CHANGELOG: ChangelogEntry[] = CHANGELOG_UPDATES.flatMap(u => u.entries);

/** The newest entry's id: what a person has "seen up to" once they close the popup. */
export const LATEST_CHANGELOG_ID = CHANGELOG[0].id;
