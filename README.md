# Thirst Trap 🚿

A mobile-first plant care web app for shared households. Track watering, fertilizing, and plant health — in real time, across multiple users.

**Live app:** https://thirst-trap-15acc.web.app

---

## About

Thirst Trap was built as a personal project to solve a real problem: keeping track of which plants have been watered, by whom, and when — across a shared household. It is actively used by real users.

---

## Features

- **Google Sign-In** with household creation and invite code joining
- **Real-time sync** — updates appear instantly across all household members' devices
- **Watering & fertilizer logging** with full calendar history and past-date entry
- **Thirst intervals** — set a target watering frequency per plant; overdue plants are highlighted
- **Smart badges** — tiles show "In X days", "Due today", or "X days late" at a glance
- **Projection dots** — calendar displays predicted next watering date based on last log
- **AI health analysis** — upload a photo and get a diagnosis powered by the Claude API
- **Thirst Quencher mode** — a checklist view for watering rounds, with sound effects and haptic feedback
- **Batch watering** — long-press to multiselect and log multiple plants at once
- **Location filter** — filter and group plants by room or area
- **Plant notes** — freeform notes per plant, auto-saved on blur
- **PWA-ready** — installable to the home screen on Android and iOS

---

## Tech Stack

| Layer | Technology |
|---|---|
| Front end | React 19, Vite |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Authentication (Google) |
| File storage | Firebase Storage |
| Hosting | Firebase Hosting |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Audio | Web Audio API (synthesized sounds) |
| PWA | Web App Manifest |

---

## Project Structure

```
src/
├── components/
│   ├── AddPlantModal.jsx
│   ├── EditPlantModal.jsx
│   ├── FertilizerTab.jsx
│   ├── HealthTab.jsx
│   ├── HouseholdModal.jsx
│   ├── ThirstQuencher.jsx
│   └── WateringTab.jsx
├── hooks/
│   └── useAuth.js
├── lib/
│   ├── anthropic.js
│   ├── firebase.js
│   └── sounds.js
└── screens/
    ├── HomeScreen.jsx
    ├── HouseholdSetupScreen.jsx
    ├── LoginScreen.jsx
    └── PlantDetailScreen.jsx
```

---

## Running Locally

1. Clone the repo
2. Create a `.env` file with your Firebase and Anthropic API credentials (see `.env.example` if provided)
3. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

---

## Notes

- Firestore queries are sorted client-side to avoid composite index requirements
- All plant and log data is scoped to a `householdId` for multi-household support
- The Claude API is called directly from the browser using the `anthropic-dangerous-direct-browser-access` header
