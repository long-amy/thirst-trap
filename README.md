# Thirst Trap 🚿

A mobile-first plant care web app for shared households. Track watering, fertilizing, propagation lineage, and plant health — in real time, across multiple people.

**Live app:** https://thirst-trap-15acc.web.app

Claude Code is my engineering team. I own the product — the problem, the scope, the decisions, and finding the bugs.

---

## The problem

I built this because our house needed it. Two people, one apartment, forty-odd plants, and a husband who had tried the plant apps on the market and hated all of them.

The failure mode isn't forgetting to water — it's *not knowing whether the other person already did*. You either double-water (and rot the roots) or both assume the other one handled it.

Existing plant apps are built for one person and one plant at a time: they nag you with notifications and expect you to tap "watered" per plant, per day. That's a task manager. What a shared household actually needs is **shared state** — a glanceable answer to "what still needs doing, and did anyone already do it?"

So the product is built around three ideas:

1. **The household is the unit, not the user.** Every plant, log and photo belongs to a household. Two people see the same thing, instantly.
2. **Watering is a round, not a task.** You don't water one plant — you walk the house with a watering can. The Thirst Quencher is a checklist for that walk.
3. **Plants are not deleted, they're archived.** A plant that died or got given away is still part of your history.

---

## Screenshots

<table>
  <tr>
    <td align="center"><img src="screenshots/home_23SEP.png" width="200"/><br/><sub><b>Home</b> — what needs doing, at a glance</sub></td>
    <td align="center"><img src="screenshots/care_23SEP.png" width="200"/><br/><sub><b>Care</b> — water and fertilizer on one calendar</sub></td>
    <td align="center"><img src="screenshots/quench_23SEP.png" width="200"/><br/><sub><b>Thirst Quencher</b> — a watering round, grouped by day</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="screenshots/family_23SEP.png" width="200"/><br/><sub><b>Families</b> — propagation lineage and events</sub></td>
    <td align="center"><img src="screenshots/health_23SEP.png" width="200"/><br/><sub><b>Health</b> — photo diagnosis via Claude</sub></td>
    <td></td>
  </tr>
</table>

---

## Features

**Shared household**
- Google Sign-In; create a household or join one with a 6-character invite code
- Real-time sync — a log by one person appears on the other's phone immediately
- Every log records who did it and when

**Care tracking**
- One combined calendar for watering *and* fertilizing — blue for water, pink for feed, olive for a check. Days with both get a split background plus a dot per kind
- Per-plant intervals ("thirsty every 7 days") with projection dots for the predicted next due date
- Back-date any entry by tapping a past day
- **Checked** as a first-class action, distinct from watering — "I looked, it's still damp" pushes the schedule without falsely recording a watering
- Batch logging: long-press to multi-select, then water/check/feed a whole shelf at once

**Thirst Quencher**
- A checklist view for a watering round, with sound and haptics as you tick plants off
- Group **by day** (Overdue / Today / Tomorrow / weekday, with everything past a week collapsed into Later) or **by room**
- Within a day, plants sort by room so you're not criss-crossing the house

**Plant families**
- Group a mother plant with everything propagated from it, via `familyId` + `parentPlantId`
- Shared lineage timeline: re-potted, took a cutting, propagated, rooted, potted up, divided, pruned
- Logging a cutting can create the child plant in one write, already parented
- Top-level Families screen showing the lineage tree, plus a per-plant Family tab

**Archiving**
- Archive with a reason (re-potted, propagated, given away, sold, died, other) and an optional note
- Archived plants leave the grid, the Thirst Quencher and the reminder notifications, but keep every log, photo and family event
- Reversible at any time

**Other**
- AI health analysis — upload a photo, get a diagnosis from Claude
- Daily push reminders via a scheduled Cloud Function, at your chosen time and timezone
- Installable PWA with a working Android back gesture
- Freeform per-plant notes, location filter, search

---

## Product decisions

**"Checked" is a separate action from "watered."**
The obvious design is one button. But the real behaviour is: you stick a finger in the soil, find it's still damp, and walk away. With nowhere to record that, people tap "watered" to silence the reminder — and corrupt their own history. Checking logs the visit and can push the next due date without claiming water was applied.

**Archive, don't delete.**
Deleting a plant that died throws away the evidence of why. Archiving keeps the watering history, photos and lineage, so "this is the third Calathea I've killed" is answerable. The reason field turns an ending into data.

**The Thirst Quencher groups by day, sorts by room.**
Day answers the question you're actually asking ("what needs doing today?"); room describes the walk you're about to take. Day wins as the grouping because the decision comes first — but sorting by room *within* each day gives you the route for free. Room grouping stayed as a toggle rather than being replaced.

**One calendar, not two.**
Watering and fertilizing had separate tabs and separate calendars. But the thing you want to see is the *interaction* — did I feed it right after watering? Combining them makes that visible in one glance.

**Say "Tomorrow," not "In 1 day."**
I noticed the app had never once told me to water something tomorrow — it always jumped from "in 2 days" straight to "due today." That turned out to be a real scheduling bug rather than just wording. Worth recording because it was invisible in the data and only surfaced as a phrase that never appeared.

**A 7-day horizon.**
Grouping strictly by date produces a wall of one-plant headers stretching weeks out. Anything past a week collapses into "Later" — a schedule that far ahead isn't actionable anyway.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Front end | React 19, Vite |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Authentication (Google) |
| File storage | Firebase Storage |
| Serverless | Cloud Functions v2 (Node 22) — scheduled reminders, Claude proxy |
| Secrets | Google Secret Manager |
| Hosting | Firebase Hosting |
| AI | Anthropic Claude API (`claude-opus-5`), server-side |
| Push | Firebase Cloud Messaging |
| Dates | date-fns |
| PWA | Web App Manifest |

---

## Project Structure

```
firestore.rules              # household-scoped Firestore rules
storage.rules                # household-scoped Storage rules
test/
└── rules.test.mjs           # 23 emulator tests for the rules above
functions/
└── index.js                 # scheduled reminders + Claude proxy (callable)
src/
├── components/
│   ├── AddPlantModal.jsx
│   ├── ArchivePlantModal.jsx
│   ├── BottomNav.jsx
│   ├── CareCalendar.jsx     # combined water + fertilizer calendar
│   ├── CareTab.jsx          # watering & fertilizing actions, intervals, stats
│   ├── EditPlantModal.jsx
│   ├── FamilyTab.jsx        # per-plant lineage + event log
│   ├── HealthTab.jsx
│   ├── HouseholdModal.jsx
│   ├── NotificationSettings.jsx
│   └── ThirstQuencher.jsx   # watering-round checklist
├── hooks/
│   ├── useAuth.js
│   └── useBackGuard.js      # Android back gesture handling
├── lib/
│   ├── anthropic.js         # thin wrapper over the callable function
│   ├── archive.js
│   ├── dates.js             # single source of truth for care-schedule math
│   ├── families.js          # lineage model + event types
│   ├── firebase.js
│   └── sounds.js
└── screens/
    ├── FamiliesScreen.jsx
    ├── HomeScreen.jsx
    ├── HouseholdSetupScreen.jsx
    ├── LoginScreen.jsx
    └── PlantDetailScreen.jsx
```

---

## Running Locally

1. Clone the repo and create a Firebase project (Firestore, Auth with Google, Storage, Hosting)
2. Copy `.env.example` to `.env` and fill in your Firebase config
3. Install and run:

```bash
npm install
npm run dev
```

The AI health check additionally needs an Anthropic API key deployed as a function secret — **not** a `.env` variable:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only functions
```

### Tests

Security rules are tested against the Firebase emulators (requires Java) — 23 Firestore
cases and 7 Storage cases, covering cross-household reads, writes, deletes, and the
cross-service household lookup:

```bash
npm test
```

### Deploying

```bash
npm run build
firebase deploy
```

---

## Notes

- All plant and log data is scoped to a `householdId`; Firestore and Storage rules enforce that scope, covered by emulator tests in [`test/rules.test.mjs`](test/rules.test.mjs)
- The Anthropic API key lives in Google Secret Manager and is read only by the Cloud Function — never by the browser
- Households are capped at 2 members, enforced in the security rules rather than only in the UI
