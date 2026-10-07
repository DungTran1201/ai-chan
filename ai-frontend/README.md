# AI Frontend

Frontend application for AI-Chan website, responsible for rich UI interactions, streaming responses, and client-side fast computing.

## Responsibilities
- **Interactive UI**: Responsive chat interface, rich markdown rendering, syntax-highlighted code blocks, artifact viewer.
- **Client-Side Fast Processing**:
  - Offline token estimation and regex sanitization.
  - Client-side cache (IndexedDB / LocalStorage) for prompt histories and draft sessions.
  - Optimistic UI updates and stream chunk rendering.
  - Web Worker offloading for computationally intensive client tasks.
- **State Management**: Reactive stores for active chats, model selector, user preferences, and network states.

## Directory Structure
```
ai-frontend/
├── public/                 # Static assets, icons, fonts
├── src/
│   ├── app/                # Application routes / pages (App Router)
│   ├── components/         # Reusable UI components
│   │   ├── chat/           # Chat input, messages, stream renderer, tool cards
│   │   ├── layout/         # Header, sidebar, modals, app shell
│   │   └── ui/             # Core design system primitives (buttons, inputs, tabs)
│   ├── hooks/              # Custom hooks (e.g., useChatStream, useDebounce)
│   ├── services/           # Backend API, WebSocket, and SSE clients
│   ├── stores/             # Global client state (Zustand / Context)
│   ├── types/              # TypeScript definitions & API schemas
│   ├── utils/              # Helper utilities, formatters
│   └── workers/            # Web Workers for client-side compute & parsing
├── .env.example            # Environment variable template
├── package.json            # Dependencies & build scripts
├── tsconfig.json           # TypeScript configuration
└── README.md
```

## Getting Started
```bash
npm install
npm run dev
```
