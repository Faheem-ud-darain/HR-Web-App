// The name of the page a signed-in person is on, for the phone top bar. Routes look like /<role>/<section>, so the
// section (the second part of the path) is the title; the role's home page (/admin, /hr, /employee) has none.

const TITLES: Record<string, string> = {
  'team-chats': 'Team Chats',
  chat: 'Team Chat',
  'direct-messages': 'Direct Messages',
  'hr-admin': 'HR & Admin',
  assistant: 'Del',
  hr: 'HR',
};

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** "Tickets" for /hr/tickets, "" for a home page or an unknown path. */
export function pageTitle(pathname: string | null | undefined): string {
  const section = (pathname || '').split('/').filter(Boolean)[1];
  return section ? (TITLES[section] ?? titleCase(section)) : '';
}
