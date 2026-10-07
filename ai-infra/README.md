# AI Infra

Infrastructure, deployment configurations, orchestration, and operational tooling supporting the AI-Chan website.

## Components
- **Containerization (`docker/`)**: Multi-stage production and dev Dockerfiles for `ai-frontend` and `ai-backend`.
- **Orchestration (`compose/`)**:
  - `docker-compose.yml`: Local full-stack development environment (Frontend, Backend, PostgreSQL, Redis).
  - `docker-compose.prod.yml`: Production deployment stack with Nginx reverse proxy, resource constraints, and healthchecks.
- **Reverse Proxy & Routing (`docker/nginx/`)**: Nginx configuration with SSL termination, API rate-limiting, static asset caching, and WebSocket/SSE reverse proxying.
- **Monitoring & Observability (`monitoring/`)**: Prometheus scrape configs and Grafana metrics dashboards.
- **Automation Scripts (`scripts/`)**: Setup scripts for Windows (PowerShell) and Linux/macOS (Bash), database migration automation, and backup routines.

## Directory Structure
```
ai-infra/
├── compose/
│   ├── docker-compose.yml        # Development multi-service compose
│   └── docker-compose.prod.yml   # Production deployment compose
├── docker/
│   ├── backend.Dockerfile        # Container recipe for ai-backend
│   ├── frontend.Dockerfile       # Multi-stage container recipe for ai-frontend
│   └── nginx/
│       └── nginx.conf            # Reverse proxy, SSL, rate limiting
├── monitoring/
│   └── prometheus/
│       └── prometheus.yml        # Metrics scraping configuration
├── scripts/
│   ├── setup.ps1                 # Windows developer bootstrap script
│   └── setup.sh                  # POSIX developer bootstrap script
├── .env.example                  # Consolidated infrastructure environment template
└── README.md
```

## Quick Start
```bash
# Start full local stack via Docker Compose:
docker compose -f compose/docker-compose.yml up --build -d
```
