# AI Backend

Backend service for AI-Chan, architected into two decoupled modules:
1. `src/`: Core application lifecycle, database, authentication, business services, and public REST/WebSocket APIs.
2. `llm/`: Autonomous Large Language Model integration engine managing API providers, prompt engineering, streaming, function calling tools, and token tracking.

## Architecture & Directory Layout

```
ai-backend/
├── src/                          # Core Backend Application
│   ├── api/                      # Routing & API controllers
│   │   └── v1/                   # Versioned REST & WebSocket endpoints
│   ├── core/                     # Configuration, security, exceptions, logging
│   ├── database/                 # SQLAlchemy ORM models, connection pool, migrations
│   ├── repositories/             # Data access layer
│   ├── services/                 # High-level business logic
│   └── main.py                   # Application entrypoint & lifespan
│
├── llm/                          # LLM Integration Engine
│   ├── providers/                # Multi-provider adapters (OpenAI, Gemini, Anthropic, Ollama)
│   ├── prompts/                  # Versioned prompt templates & system instructions
│   ├── tools/                    # Function calling tools & agent tool registry
│   ├── memory/                   # Context window & conversation buffer management
│   ├── streaming/                # SSE & token chunk streaming handlers
│   ├── guardrails/               # Prompt injection defense & output moderation
│   ├── cost_tracker/             # Token usage counter & API budget guards
│   └── client.py                 # Central LLM Manager & Fallback Router
│
├── tests/                        # Unit & integration test suites
├── .env.example                  # Environment configuration template
├── requirements.txt              # Production Python dependencies
└── README.md
```

## Setup & Running
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```
