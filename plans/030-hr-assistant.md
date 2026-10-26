# 030 — Read-only AI assistant for HR and Admin

Status: **plan only, nothing built.** Written 2026-10-26 after the owner described the feature.

## 1. What it is

A helper inside the app that HR and Admin can ask questions and ask for drafts. It explains, summarises
and drafts. **It never changes anything.** Inspired by agent-style assistants, but deliberately the
opposite in autonomy: no actions, no background work, no outside data.

What it helps with (in build order):

1. **Payroll explanations** — "Why is Sara unpaid?", "Why does Ali have deductions?", "Who has reserved
   salary and when is it payable?", "What changed after payment?", company-wide totals and flags.
2. **Ticket help** — draft replies for HR; summarise a ticket thread; group tickets that look like the same
   problem; link a ticket to the employee's tracker status ("no captures for 3 days; ticket says the app asks
   for permission") and suggest likely fixes.
3. **Tracker health** — who has a stale token, never connected, an old version, a gap in captures; what looks
   like a pattern across employees.
4. **Admin insights** — attendance, hours, absences, leave and ticket trends, per person, team or company.
5. **Screenshot insights (last, with safeguards)** — what screenshots show about how people are working,
   reported as evidence, not verdicts (section 6).

## 2. The rules (enforced in code, not by prompt wording)

| Rule | How it is enforced |
|---|---|
| **No data outside this app, for now** | The assistant has **no** web search, browsing, file or external-connector tools. Its only tools read this app's own data. Nothing from outside is ever fetched. |
| **Admin and HR only** | One server route, `POST /api/assistant`, checks the verified session role and returns 403 for anyone else (employees, team leads, signed-out). The panel is not rendered for other roles, and tools re-check the role. |
| **Does nothing on its own, except notify HR/Admin** (owner decision) | The chat assistant is strictly read-only: no write tools, no sending of replies, only runs when a person asks. The **only** automatic behaviour is the separate alerts job (section 3d), which can do exactly one thing — create a notification for HR/Admin (and record that it did). It has no other write access and never contacts employees. |

| **Employees have no access at all** | There is no employee-facing assistant, chat box or endpoint. An employee cannot ask it anything — about salaries, passwords or anything else. Employee questions keep going through tickets, which HR answers (optionally with a draft from the assistant). |
| **It never handles credentials, even for HR/Admin** | Tools return only an explicit allow-list of fields. Passwords and password hashes, session and login tokens, reset codes, tracker setup tokens and API keys are **never** read into the assistant or shown in an answer; if asked, it says it cannot help with that. Tool outputs are scanned for credential-like values before they reach the model, and a test fails the build if a tool adds such a field. |
| **Bank details: HR/Admin may ask, the model never sees the numbers** (owner decision) | A bank-details tool returns a **placeholder** (for example `[[BANK:emp_ref]]`), not the data. The server route replaces the placeholder with the real bank name, account number and IBAN **after** the model has answered, just before the answer is shown to HR/Admin. The provider (a free Groq/OpenRouter key) therefore never receives account numbers. Each lookup is written to the audit log (who asked, about whom); the log keeps the placeholder, not the number, and saved chat history stores the placeholder too. Salary amounts are sent to the model (needed for explanations) but only with names replaced by "Employee A". |

"For now" is kept honest by design: each capability that could be added later (digests, notifications,
sending drafts) would be a separate, switched-off feature flag with its own review. Today's build contains
none of that code.

Note on the first rule: the assistant's *knowledge and sources* stay inside the app, but the question and
the app data it needs for that answer are sent to the model provider to produce the reply. That is
unavoidable with a hosted model; see section 7.

## 3. Design

```
 HR / Admin browser ──▶  POST /api/assistant  (Pages route, edge)
                           │ 1. verify session, role must be hr/admin
                           │ 2. rate-limit, log the question (who, what, when)
                           │ 3. call the model with a FIXED list of read-only tools
                           ▼
                    Model API (Groq / OpenRouter) ◀──▶ tools run on the server, as the caller:
                                     explain_pay(employee, month)   – uses the payroll engine
                                     payroll_overview(month, group) – totals, flags, reserved, unpaid
                                     get_ticket(id) / list_tickets(filter)
                                     get_employee_activity(employee, range)  – shifts, absences, leave
                                     tracker_health(employee | all)          – integrity rules + versions
                                     screenshot_notes(employee, day)         – stage 5 only
                           │
                           ▼  answer + the evidence it used (records, dates) → shown to the person
```

Key choices:

- **Numbers come from code, words come from the model.** `explain_pay` runs the same
  `computePayrollView`/breakdown logic as the Payroll screen and returns facts with dates (which absence
  days, leave days, short shifts, caps, held amounts). The model only phrases them. It is told never to
  calculate, and every figure in an answer must come from a tool result.
- **Evidence shown with every answer.** The panel lists the records and dates behind the answer so a person
  can check it; screenshots are links, never summarised away.
- **Fixed tool list, structured inputs, size limits.** No tool takes free-form queries against the database.
- **Prompt-injection safety.** Ticket text and screenshot content are treated as untrusted data and passed
  as quoted data, never as instructions; with only read-only tools the worst a hostile ticket can do is
  produce a bad draft that a human reads.
- **Audit log.** Every question, the tools used and the records touched are stored (who asked about whom),
  visible to Admin.
- **Model choice (free build).** For now the assistant runs on **free API keys from Groq and OpenRouter**, both
  of which speak the OpenAI-style API. The code talks to a small provider interface, so the provider and model
  are configuration (secret + model name), and moving to a paid model such as Claude later is a config change,
  not a rewrite. Groq is the primary (fast); OpenRouter's `:free` models are the fallback. See section 8.
- **Where it runs.** A Pages route (same place as the app's other server code), so no new infrastructure.

## 3a. How it reads the actual data (owner decision: real database, not the UI)

- **Source:** the assistant reads PocketBase through server code (the same server-side access the API routes
  use). It never scrapes or reads rendered pages.
- **Read-only by construction:** one small wrapper, `assistantDb`, exposes only GET requests for an allow-list
  of collections and fields. There is no write, update or delete function in the assistant's code at all, so
  even a bad prompt cannot change data. A test fails if the wrapper gains a write method.
- **No model-written queries:** the model chooses a tool and passes simple typed arguments (employee, month,
  date range, status). The server builds the filter itself with the safe filter builder, so the model cannot
  request other tables, fields or free-form filters.
- **Keep token use low (free credits are small):** totals and counts are computed in code and only the result
  is sent ("7 absences, 2 leave days"), not the rows; results are capped and compact; identical questions and
  monthly summaries are cached; a small model picks the tool and the larger one writes the final answer;
  a daily token counter shows "limit reached, try later" instead of failing.
- **"Letting HR/Admin know"** is done by the alerts job in section 3d, not by the chat model.

## 3b. Natural-language use

HR and Admin just type (English) in a chat panel, for example "why is Sara unpaid?", "who had the most
absences last month?", "draft a reply to ticket 42", "which trackers had problems this week?".

- **Understanding names and dates is done by code, not guessed by the model.** An `find_employee` tool
  resolves names (typos, first name only, partial) and returns candidates; if more than one matches, the
  assistant asks "Did you mean Sara Khan or Sara Ali?". Relative dates ("last month", "last Friday",
  "this week") are resolved by the server against the New York calendar and shown back in the answer.
- **Follow-ups work.** The conversation keeps a short history (last few turns) so "and what about October?"
  or "show the details" makes sense. History is kept only for the session and in the audit log, readable by
  HR/Admin only.
- **Worked examples (owner's questions).**
  - *"How many leaves were requested by employee 1 this month?"* → a count by the server, split into
    requested / approved / pending / rejected with days and dates ("3 requests: 2 approved = 4 days,
    1 pending = 1 day"). "Requested" is never confused with "taken".
  - *"For how many hours was employee 2 slacking off?"* → the assistant does **not** answer with a verdict.
    It reports measurable facts: hours worked against expected, minutes of tracker-recorded inactivity (and in
    how many periods), absences and short shifts, and — from a sample of screenshot notes — how many showed a
    non-work site, each with links as evidence. It states what these do not prove (meetings, reading, breaks
    look like inactivity) and leaves the judgement to the person. It never calls anyone "slacking".
  - Sources: timesheets (hours), `hr_inactivity_logs` (idle periods), absence and shift-shortfall records,
    screenshot notes (stage 5, on demand).
- Only HR and Admin can ask these questions; an employee cannot reach the assistant at all.

- **Questions it cannot answer** (outside this app's data, credentials, or something it has no tool for) get
  a plain "I can't help with that" plus what it can do, never an invented answer.
- **Starter suggestions** (clickable chips) show the common questions so people learn what to ask.
- **Always shows its evidence** (records and dates) so an answer can be checked.
- **Free-model realities:** short history and short tool results to stay inside token limits; the app, not
  the model, does name matching, date maths and arithmetic, which are where small models slip.
- **Changing settings in plain words** ("alert me when someone works over 6 weekend hours") is a write, so it
  is **not** done by the model: it may *suggest* the rule, and Admin applies it in the alert settings screen.

## 3c. Knowledge and voice (owner: highly knowledgeable, understands simple questions, feels human)

- **Company knowledge pack.** Written from this repo's own code and documents so it matches real behaviour:
  payroll rules (pay timing, deductions, caps, new-joiner rules, corrections, increments), leave types and how
  each is charged, absence and short-shift rules, tracker behaviour, teams and regions, glossary, and the
  policy page text. Kept as small tagged pieces; the app sends only the few pieces relevant to each question
  (keyword match), which keeps token use low on free limits.
- **Facts from tools, rules from the pack.** The pack explains how things work; tools return the actual
  numbers for a person. The model never calculates.
- **Vague questions.** The assistant states a sensible assumption and answers ("I took this month") and asks a
  question back only when it truly cannot proceed. A synonym list covers everyday words (pay / salary / money /
  cut / fine / docked / deduction). Names and dates are resolved by code.
- **Answer shape (owner: data answers highly organised, simple answers simple).**
  - *Simple question → simple answer:* one or two sentences, no headings, no extra detail unless asked
    ("Yes, her September salary was marked paid on 1 October.").
  - *Data question → fixed layout, always in this order:* (1) the answer in one line; (2) a small table or list
    of the numbers; (3) the breakdown behind it with dates; (4) evidence links to the records; (5) a short note
    only if the numbers do not prove something (for example "inactivity can include meetings").
  - **The app renders the tables and lists** from tool results using fixed templates per question type; the
    model writes only the opening line and the short explanation, so numbers and layout cannot be scrambled.
  - Length rule for the model: short unless the question needs detail; long lists are collapsed behind
    "show all". Money always uses the employee's currency (PKR or USD), dates always one format (New York
    calendar), and the layout is covered by the evaluation set.

- **Tone.** Warm, short, direct; uses first names; says what it understood; offers a next step; no stiff
  corporate wording. It always identifies itself as an AI assistant and never pretends to be a person. It says
  "I'm not sure" instead of guessing.
- **Evaluation set.** About 100 real questions with expected answers, including typos and vague phrasing, run
  before every change (stored in the repo, tests fail on regressions in the deterministic parts; the
  model-answer checks are run by hand and logged).
- **Feedback.** Thumbs up/down on each answer, stored in `hr_assistant_log` (HR/Admin only) to find weak spots.
- **Free-model reality.** The best free models are good but less sharp than top paid ones at subtle questions
  and natural tone; choose the strongest free model per provider and re-test when models change. Switching to a
  paid model later (a configuration change) is the biggest single quality upgrade.

## 3d. Alerts to HR and Admin (owner decision: it may send notifications)

A separate, **rules-based** job, not the language model: no free credits are used for routine alerts.

- **Schedule:** the existing Cloudflare cron Worker calls `/api/cron/assistant-alerts` (for example every
  morning, and the day before pay day). Same pattern, secret and batching limits as the other cron routes.
- **Rules (pure functions in `src/lib/core/alertRules.ts`, with tests; thresholds editable by Admin):**
  - **Salary due:** the day before the pay date, "N salaries will be paid tomorrow: X unpaid, Y flagged"
    → Admin.
  - **Many leaves:** approved leave days in the month above a threshold → HR and Admin.
  - **Tracker problem:** no capture or heartbeat for 7 days although the employee had shifts (reuses the
    tracker-integrity rules) → HR and Admin.
  - **Weekend work:** hours worked on a Saturday or Sunday above a threshold (New York calendar days) →
    HR and Admin.
  - More can be added the same way (for example unpaid earlier months, missing bank details before pay day).
- **Text:** fixed templates filled with facts. An "Explain this alert" button asks the assistant on demand
  (the only time an alert uses model credits).
- **Noise control:** each (rule, employee, period) alerts once and then stays quiet for a cooling-off
  period; optional single daily digest instead of separate alerts; Admin can switch any rule on or off and
  set its threshold; alerts have an acknowledge/mute action for the recipient.
- **Recipients:** HR and Admin only (role-based), never an employee, and never any recipient list the model
  chooses. Alert text avoids secrets (no bank or credential data, ever).
- **Audit:** every alert created is logged (rule, subject, recipients, time) in `hr_assistant_log`.
- **Delivery:** the app's existing notification system (in-app bell, plus push where enabled).
- **Prerequisite:** the database lock-down. Notifications to HR/Admin are readable by anyone today (open
  PocketBase), so an alert about an employee would be visible to employees until that is fixed.

## 3e. Interface: floating buddy + full page (owner decision)

- **Position (owner: floating over the bottom corner, preferably right).** Fixed in the **bottom-right** corner,
  about 24 px in from the edges (honouring the safe-area insets), floating above the page content. The chat
  window opens up and to the left of it (about 380 px wide, at most 70% of the screen height). It can be
  dragged to the bottom-left if it covers something, and remembers its place. It sits below toasts and above
  normal page content; like the mobile bottom navigation, it hides while a dialog is open so it never
  overlaps one. On phones it sits above the bottom navigation pill. A small "hide" action tucks it into the
  edge for people who want a clear screen (the sidebar keeps an "Assistant" link as well).
- **Floating buddy.** A small round button in the bottom corner of every HR and Admin page, rendered by the
  dashboard layout only for those roles (never for employees; the server also refuses them).
- **First click → small chat window** above the button (not a full-screen overlay, so the page behind stays
  visible): text box, a few suggested questions, recent conversation.
- **Expand to a full page** (`/admin/assistant`, `/hr/assistant`) with a button in the small window; the same
  conversation continues there, with more room for tables and long answers, and a "minimise" button returns
  to the small window.
- **One conversation, two views.** The conversation lives on the server (HR/Admin-only `hr_assistant_log`),
  and both views load it by id, so nothing is lost when expanding or minimising. The widget lives in the
  layout, so the conversation also survives navigating between pages.
- **Page context hints.** A page can tell the buddy what is open (a ticket, an employee) so it can offer
  "Draft a reply to this ticket"; hints are only suggestions, the server re-checks permission.
- **Ticket reply drafting (owner request: usable from an open ticket).** In the ticket reply box, HR sees a
  "Draft a reply with Del" button. It sends the ticket's subject, first message and last few replies to the
  assistant, which writes a ready-to-send reply (greeting by first name, plain explanation, what happens next,
  sign-off) into the reply box. A separate one-line "check before sending" note is shown to HR only and is
  never put into the reply. **It never sends anything:** HR edits and presses send.
  - *Privacy:* the server removes the employee's name, e-mail addresses and phone numbers from the ticket text
    BEFORE it goes to the model provider (placeholders such as `[EMPLOYEE]`, merged back into the draft on the
    HR person's screen). The note under the button says so. Attachments are never sent.
  - *Limits of this mode:* it has no access to the employee's pay, leave or tracker records, so it must not
    state amounts, dates or decisions that the ticket does not contain; it says HR is checking, or asks for the
    missing detail, and the HR note lists what to verify. (A later version can add the verified facts from the
    pay and tracker tools, with the same redaction.) No offers of calls or timeframes.
  - HR only; Admin cannot reply to tickets, so no button is shown to Admin or employees.
  - The orb stays visible on the ticket screen (it used to hide whenever the ticket panel marked itself as a
    modal).
- **Suggested-action buttons (owner request).** Under a reply the assistant can show up to three buttons. Only
  two kinds exist: *open a page* (payroll, leaves, tickets, tracking, and so on, optionally searching for a
  person; payroll and leaves pages apply the search) and *ask a follow-up question* (sent as the user's own
  next message; used, for example, to pick between two people with the same name).
  - The model only *suggests*: it calls `suggest_actions`; the server checks every button against an
    allow-list per role (HR and Admin have slightly different pages), trims labels, and drops anything else.
    The model never writes a link. A click runs in the app as the signed-in person, so the assistant itself
    still changes nothing and sends nothing.
  - Follow-ups worded as a message to someone else ("Can you share a screenshot…", "Please…") are dropped.
  - If the model offers no buttons, code adds sensible defaults from what the tools returned (open the payroll
    page after a pay question, tickets after a ticket, and so on). A written-out "Next steps" block or
    button pseudo-code in the reply text is stripped.
  - Every reply also has a **Copy** button (for pasting a drafted reply into a ticket).
  - **Not included, on purpose:** any button that changes data (mark paid, send a reply, approve leave). If
    wanted later, such a button would only open the existing screen and go through its own confirm step.
- **Alerts.** A small dot on the buddy when the alerts job has something; clicking lists the alerts.
- **Phones:** the window becomes a tall sheet; the button sits above the bottom navigation bar; honours the
  safe-area insets and the native back button (Capacitor).
- **Accessibility:** keyboard open/close, focus trap and labelled controls (same Modal behaviour), Escape
  closes the small window.
- **Avatar (owner choice): Thinking Orbs** (https://libraries.dev/orbs, npm `thinking-orbs`). Checked: MIT
  license, React 18+ peer dependency (this app uses React 19), no runtime dependencies, about 130 KB unpacked,
  no install scripts, version 0.3.x (young, pre-1.0 — pin the exact version, review upgrades). Props: `state`
  (working, searching, solving, listening, connecting, weaving, composing, breathing, shaping), `size` (64 or
  20), `speed`, `dark`, `paused`.
  - *State mapping:* idle → `listening` (a full, calm dotted sphere; `breathing` looked hollow); typing → `listening`; reading the database or a ticket →
    `searching`; working out a payroll answer → `solving`; switching provider after a limit/429 →
    `connecting`; writing the reply → `composing`; alert waiting → a small coloured dot badge on the button.
  - *Free tier only:* the library's site marks `weaving`, `shaping` and the 32 px size as Pro-only, so we use
    only the seven free states (`working`, `searching`, `solving`, `listening`, `connecting`, `composing`,
    `breathing`) and sizes 64 and 20. `listening` is the calm default.
  - *Sizes:* 64 for the open chat header and message avatars, 20 inline next to "thinking…" text.
  - *Accessibility:* `paused` when the user prefers reduced motion; the orb is decorative, so the button keeps
    its text label ("Open assistant") and status is also announced as text.

- **Build:** a `FloatingAssistant` component in the (dashboard) layout (role-gated), a `ChatPanel` shared by the
  small window and the full page, the two page routes, and the conversation endpoints on `/api/assistant`.

## 4. What has to be built

| Piece | Notes |
|---|---|
| `src/lib/core/payrollExplain.ts` + tests | per-day evidence for deductions, held/reserved/deferred amounts, why-unpaid reasons, correction history. Same engine as the screens, so they cannot disagree. |
| `src/app/api/assistant/route.ts` | auth, rate limit, tool loop, audit log |
| `src/lib/assistant/tools/*.ts` + tests | one file per read-only tool, role re-check, output size caps |
| Panel component | side panel on Payroll and Tickets, and a chat box on the Admin dashboard; shows evidence |
| `hr_assistant_log` collection | audit trail (schema change, done with the usual dry-run action, not by hand) |
| Privacy page / consent text | says AI analysis exists, what it reads and who can use it |

## 5. Build order, stages and effort (rough)

0. **Foundation (about 2 days).** Chat route (HR/Admin only), `assistantDb` read-only wrapper, provider layer
   (Groq primary, OpenRouter fallback), audit log, name pseudonymisation and bank-detail placeholder merge,
   daily usage guard, tests that fail the build if a write method or a credential field appears.
1. **Payroll explanations (about 3 days).** Why unpaid, why deductions (with dates), reserved/held/deferred
   salary, corrections, company-wide payroll overview. First because the payroll engine already has the
   answers, it is text and data only, and it proves the foundation.
2. **Tickets and trackers (about 3 days).** HR reply drafts, ticket summaries and grouping, ticket-to-tracker
   linking and suggested fixes.
3. **Alerts (about 2–3 days).** Scheduled rules job: salary due tomorrow; more than 5 leave days requested in a
   month; tracker problem for 7 days; more than 5 hours worked on a weekend. After the chat stages because it
   reuses the same rule code and the owner should see the assistant working before anything runs on its own.
4. **Admin insights (about 2 days).** Attendance, hours, absences, leave and ticket trends; weekly summary.
5. **Screenshot insights (about 4 days plus a trial).** Last: most privacy risk, free quotas cannot cover bulk
   analysis, least certain value.

Each stage ships on its own behind a switch: Admin first, then HR, tested with the test accounts before real
data. **Nothing goes live with real data until the database lock-down and the admin password rotation are
done** (section 7).

## 6. Screenshots (stage 5) — how, and the cautions

- A cheaper model writes a one- or two-line **note per screenshot once** (for example "spreadsheet open",
  "email", "video site", "screen locked", "unclear") stored as text beside the screenshot. The assistant
  answers from the notes and opens an actual image only when asked. This keeps cost and delay down: about
  40 staff produce well over a thousand screenshots a day.
- Answers are **evidence, not verdicts**: "12 of 32 screenshots on Tuesday show a video site; here are the
  links." A single frame cannot tell reading from idling, so the assistant is instructed never to label
  anyone as "not working" and to state its uncertainty. People decide.
- Employees should be told this analysis exists (privacy page and consent text), and the owner should
  decide whether an employee can see what was said about them. Depending on the country, this may also have
  legal requirements; get advice from someone qualified.
- Access: both HR and Admin (decided).

## 7. Risks and prerequisites

- **Fix the open database first.** Today anyone on the internet can read much of the data without logging
  in (QA review). An assistant that reads salaries, tickets and screenshots would be another route to the
  same data and makes the leak more valuable. Lock-down comes before launch.
- **Data goes to the model provider.** Ticket text, records and (stage 5) images are sent to the Claude
  API. Check the data-retention and training terms of the plan used and tell employees in the privacy page.
- **Wrong or overconfident answers.** Mitigated by tools-only facts, evidence in every answer, "I don't know"
  when a tool returns nothing, and tests with real examples before each stage.
- **Cost.** Mostly stage 5 (images). Measure on a sample, cap per-user and per-day usage, and sample
  screenshots instead of reading all of them if needed.
- **Misuse.** Everything is logged; Admin can review who asked about whom.

## 8. Free build (decided 2026-10-26): Groq + OpenRouter free keys

**Limits to design for** (published numbers differ between sources and change; confirm in each console):
Groq's free plan allows roughly 30 requests/minute but only about 1,000 requests and 200,000 tokens a day on
its larger models (more requests on the smallest model), per organisation, and the per-minute token limit is
often the tighter one ([BenchLM](https://benchlm.ai/md/free-tier/groq.md),
[eesel](https://eesel.ai/blog/groq-pricing)). OpenRouter's `:free` models are about 20 requests/minute and 50
requests/day, rising to 1,000/day once the account has bought at least 10 credits
([TrueFoundry](https://www.truefoundry.com/blog/openrouter-rate-limits-your-free-tier-depends-on-what-youve-already-paid)).
For a few HR/Admin users asking questions this is enough; for bulk work it is not.

What that changes:

- **Deterministic first.** Free open models are weaker at multi-step tool use and arithmetic. So the code
  gathers the facts and the model only phrases them (already the design for payroll). The app calls the tools
  itself in a fixed order per question type where it can, instead of letting the model plan.
- **Budget guard.** Count tokens/requests per day in the app; show "daily limit reached, try later" instead of
  failing; cache identical questions for a few minutes; switch to the fallback provider on a 429.
- **Short inputs.** Send summaries and capped record lists, never whole histories (token limits).
- **Screenshots: on demand and sampled only.** Free quotas cannot cover about a thousand images a day. HR or
  Admin clicks "analyse this day for this employee" and the assistant looks at a sample (for example 8 of 32);
  notes are saved so the same day is never analysed twice. No automatic bulk analysis.
- **No guarantees.** Free tiers can change or vanish and have no uptime promise; fine for an internal helper,
  and the provider interface makes switching painless.

**Privacy is the bigger issue with free keys.** Free tiers often come with weaker data terms (one source
describes free access as partly a trade for usage data; the exact training/retention rules differ by model and
host and I could not confirm them). Before real employee data is sent:

1. Read the data terms of the exact provider and model used, and prefer one that states it does not train on
   or keep prompts.
2. **Pseudonymise text:** the app replaces names, e-mails and ids with placeholders ("Employee A") before
   sending and swaps them back in the answer, so the provider never sees who it is about. Amounts and dates
   are still sent.
3. Credentials are never sent, and bank details are never sent to the model (they are merged in by the app after the answer — rule above).
4. **Screenshots cannot be pseudonymised** (they show real screens). Stage 5 therefore stays last, needs the
   terms check above, and is switched off until the owner accepts it.
5. Mention it on the privacy page.

Effect on the build order: stages 1–3 (text and data) work well on free models; stage 5 waits.

**Model check (2026-10-26, made-up data only, one run each; Groq key from the owner).** Eight questions
(small talk, simple status, vague "why was pay cut", leave count, reserved list, "how long was X slacking",
bank account, admin password) with fixed read-only mock tools.

| Model | Result |
|---|---|
| `openai/gpt-oss-120b` | Passed all eight: right tools, correct facts, placeholder used verbatim, refused the password, reported inactivity facts with the "does not prove slacking" caution. About 13k tokens for the set. Plain but accurate wording. **Primary candidate.** |
| `qwen/qwen3.8-27b` | Passed all eight and was the most natural in tone and the best on the slacking question (refused the label, offered a follow-up). Used about 19.5k tokens (roughly 50% more). **Best for writing the answer; second candidate.** |
| `openai/gpt-oss-20b` | **Failed** the slacking question: computed "Slacking: 9 h 50 m" itself and labelled it. Also passed an odd empty argument to a tool. **Excluded.** |

Limits seen on this key (response headers): about **1,000 requests/day and 8,000 tokens/minute per model**
(a daily token cap is not exposed in headers). Consequences: keep every request **under about 5,000 tokens**
(system prompt, tool definitions, knowledge snippets and tool results together), keep the knowledge pack
retrieval small, and use both models so each has its own limits (primary + fallback).

Next checks: repeat each model a few times to see variation; test the OpenRouter free models once that key
exists; try a longer 5-turn conversation; re-test with the real knowledge pack and real tool outputs.

## 8a. Live data is connected (2026-10-26, locally)

The assistant now reads the real database when `ASSISTANT_DATA=live` is set (it is set in `.env.local` only;
without it the route answers from made-up demo data, so deploying the code does not by itself expose anything).

- **Read-only tools on real data** (`src/lib/assistant/live.ts`): find an employee; explain a person's pay for a
  month (same payroll engine as the Payroll screen, with the dates behind each deduction); company payroll
  overview per currency; reserved/held salary; leave summary; work activity (hours, absences, short shifts,
  inactivity, weekend work); tracker health (reuses the tracking-integrity rules, plus no-signal days);
  newest tickets and one ticket; bank details.
- **Names never reach the provider.** Each person is "Employee N" for the request; names in the question and in
  tool results are turned into those aliases, and aliases in the answer are turned back into names on the
  server. A name shared by several people ("Ali") is left as is so the assistant asks which one. Emails and
  phone numbers in ticket text are removed. Checked with a script against the real roster: no name, e-mail or
  bank number appeared in what would be sent to the provider.
- **Bank details** are merged in by the server after the model has answered; the model only writes a placeholder.
- **Shared loader** (`src/lib/server/payrollInputs.ts`) is now used by both the monthly cron job and the
  assistant, so both read payroll data the same way.
- **Tracker errors (owner request: know what the trackers themselves report).** `tracker_health` reads the
  trackers' own reports: last capture error and what it means in plain words, whether the screen was locked,
  failures in a row, version (desktop agent builds and Chromebook extension versions are never compared with each
  other), device, and the saved diagnostics report when HR has run one (platform, connection, update
  available, recent log lines with names and emails removed). For everyone it groups errors into patterns
  ("5 people: upload failed") and lists repeated failures, locked screens, old versions and people with no signal
  for 2+ days. A short glossary of the known errors is in the assistant's knowledge. Read-only: it does not
  change any tracker code. Chrome extension and desktop agent report through the same fields.
  *Limit:* only what the trackers already write is visible; a tracker that is closed or off reports nothing, which
  shows up as "no signal". Richer error reporting would need a tracker change (held on the local tracker branch).
- **Not done yet:** the audit log (needs a new collection, so it waits for approval), a per-day usage counter, and
  using these facts inside the ticket-draft button (it still drafts from the ticket text alone).
- **Edge limits:** a question that needs pay data makes about a dozen database reads plus the model calls; this
  stays under the ~50 outgoing requests an edge call may make, but a long conversation of heavy questions in
  one request would not.
- **Before it goes on the live site:** set `ASSISTANT_DATA=live` and `GROQ_API_KEY` as secrets on the Cloudflare
  Pages project; accept the provider's data terms; decide about the audit log collection.

## 9. Decisions

Decided by the owner (2026-10-26):

1. **Language:** English only.
2. **Screenshot insights:** available to **both HR and Admin**.
3. **Employees see nothing about it:** no employee can see the assistant, what it said, or that a question was
   asked about them. Nothing the assistant produces is stored where an employee can read it (the audit log and
   any saved answers are readable by Admin/HR only, and the log collection has no employee access).

Decided later the same day:

4. **Alert thresholds:** more than 5 leave days requested in a month (approved + pending); more than 5 hours
   worked on a weekend. Tracker problem: 7 days with shifts but no capture or heartbeat. Editable by Admin.
5. **Salary-due notice:** goes to **both Admin and HR**.
6. **Audit log:** reviewed by **both Admin and HR**.
7. **Bank details:** shown **in full** to HR/Admin (merged in by the app; the model never sees them).
8. **Only Admin and HR** can use the assistant; employees have no access at all.

Defaults used until the owner says otherwise:

- Salary-due and tracker alerts are sent as they happen; leave and weekend alerts are bundled into one
  morning digest.
- Usage cap about 150 questions a day across HR and Admin, with a warning near the limit.

Note for item 3: the privacy page should still tell employees, in general terms, that AI-assisted analysis of
tracking data exists and who can use it; that is about informing people, not showing them the assistant's
output. Whether the law where your staff work requires more is a question for someone qualified.
