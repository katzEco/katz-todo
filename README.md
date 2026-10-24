# katz-todo

Todo management service built on Bun with a Hono REST API, PostgreSQL persistence, Redis caching, and integrated Discord and Telegram bots.

## Features

- **Dashboard**: Brutalist RawBlock UI (`/` and `/dashboard`) with Catppuccin Macchiato styling, live task CRUD, and realtime stats.
- **Modular Architecture**: Clean separation between static pages (`public/`), HTTP routes (`src/routes/`), and domain business logic (`src/modules/`).
- **Runtime**: Bun with native `Bun.SQL` and `Bun.RedisClient` (zero external DB driver overhead).
- **HTTP API**: High-performance REST API powered by [Hono](https://hono.dev).
- **Caching**: 60-second Redis cache with automated invalidation on mutations.
- **Chatbots**: Simultaneous Telegram (`grammy`) and Discord (`discord.js`) bot integrations.
- **Docker**: Containerized deployment with Dockerfile and Docker Compose.
- **Cross-Compilation**: Native standalone Linux binary build script (`x64`, `arm64`).

---

## Project Structure

```text
katz-todo/
├── public/                 # Static web dashboard assets
│   ├── index.html          # RawBlock HTML markup
│   ├── css/
│   │   └── style.css       # Catppuccin Macchiato brutalist styles
│   └── js/
│       └── app.js          # Client-side reactivity, CRUD, & polling
├── src/
│   ├── bot/                # Chatbot integrations
│   │   ├── discord.ts      # Discord bot (!todo ...)
│   │   ├── telegram.ts     # Telegram bot (/todo ...)
│   │   └── index.ts        # Bot runner
│   ├── modules/            # Business logic & services
│   │   └── todo/
│   │       ├── types.ts    # DTOs & domain models
│   │       ├── service.ts  # Database queries & Redis caching
│   │       └── index.ts
│   ├── routes/             # Hono HTTP routers
│   │   ├── dashboard.ts    # Dashboard & static asset routes
│   │   ├── todos.ts        # REST API (/todos)
│   │   └── index.ts
│   ├── db.ts               # Native Bun.SQL & Bun.RedisClient
│   └── index.ts            # Application entrypoint
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- PostgreSQL (14+)
- Redis (7+)

### Installation

```sh
bun install
```

### Environment Configuration

Copy `.env.example` to `.env` and fill in your values:

```sh
cp .env.example .env
```

| Variable              | Description                                          | Default                                                      |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `PORT`                | HTTP server port                                     | `3000`                                                       |
| `DATABASE_URL`        | PostgreSQL connection string                         | `postgres://postgres:postgres@localhost:5432/app`            |
| `REDIS_URL`           | Redis connection string                              | `redis://localhost:6379`                                     |
| `DOCKER_DATABASE_URL` | PostgreSQL connection string inside Docker container | `postgres://postgres:postgres@host.docker.internal:5432/app` |
| `DOCKER_REDIS_URL`    | Redis connection string inside Docker container      | `redis://host.docker.internal:6379`                          |
| `TELEGRAM_TOKEN`      | Telegram bot API token (optional)                    | _empty_                                                      |
| `DISCORD_TOKEN`       | Discord bot application token (optional)             | _empty_                                                      |

---

## Running the Application

### Development Mode

Runs the Hono HTTP server and starts configured bots with hot-reloading:

```sh
bun run dev
```

Server starts at `http://localhost:3000`.

### Standalone Bot Runner

Run only the bot process without the Hono server:

```sh
bun run bot
```

### Production Build

Compile single-executable standalone Linux binary to `dist/`:

```sh
# Current host architecture
bun run build

# Specific architecture
bun run build --arch=x64
bun run build --arch=arm64

# Both architectures
bun run build --arch=all
```

---

## Docker Deployment

Build and run using Docker Compose:

```sh
docker compose up --build -d
```

Stop container:

```sh
docker compose down
```

---

## REST API Reference

### Web Dashboard & Health Check

```http
GET /
# or
GET /dashboard
```

**Browser Response (`200 OK`)**:
Interactive RawBlock brutalist web dashboard.

**JSON Client Response (`Accept: application/json`)**:

```json
{
  "status": "ok",
  "message": "Todo service & bots running."
}
```

### List Todos

```http
GET /todos
# Optional category filter:
GET /todos?category=work
```

**Response (`200 OK`)**:

```json
[
  {
    "id": 1,
    "title": "Buy milk",
    "category": "work",
    "completed": false,
    "created_at": "2026-10-24T15:00:00.000Z",
    "updated_at": "2026-10-24T15:00:00.000Z"
  }
]
```

### Create Todo

```http
POST /todos
Content-Type: application/json

{
  "title": "Buy milk",
  "category": "work"
}
```

**Response (`201 Created`)**:

```json
{
  "id": 1,
  "title": "Buy milk",
  "category": "work",
  "completed": false,
  "created_at": "2026-10-24T15:00:00.000Z",
  "updated_at": "2026-10-24T15:00:00.000Z"
}
```

### Update Todo Status

```http
PATCH /todos/:id
Content-Type: application/json

{
  "completed": true,
  "category": "urgent"
}
```

**Response (`200 OK`)**:

```json
{
  "id": 1,
  "title": "Buy milk",
  "category": "urgent",
  "completed": true,
  "created_at": "2026-10-24T15:00:00.000Z",
  "updated_at": "2026-10-24T15:05:00.000Z"
}
```

### Delete Todo

```http
DELETE /todos/:id
```

**Response (`200 OK`)**:

```json
{
  "success": true,
  "id": 1
}
```

### Categories API

#### List Categories

```http
GET /categories
```

**Response (`200 OK`)**:

```json
[
  {
    "id": 1,
    "name": "general",
    "created_at": "2026-10-25T00:00:00.000Z",
    "todo_count": 3
  },
  {
    "id": 2,
    "name": "work",
    "created_at": "2026-10-25T00:00:00.000Z",
    "todo_count": 5
  }
]
```

#### Create Category

```http
POST /categories
Content-Type: application/json

{
  "name": "shopping"
}
```

**Response (`201 Created`)**:

```json
{
  "id": 5,
  "name": "shopping",
  "created_at": "2026-10-25T03:00:00.000Z"
}
```

#### Delete Category

```http
DELETE /categories/:id
```

**Response (`200 OK`)**:

```json
{
  "success": true,
  "identifier": "shopping"
}
```

### Whitelist API (Bot Access Control)

Controls which Telegram User IDs and Discord User IDs are authorized to interact with the chatbots. Managed strictly via the web dashboard and REST API.

#### List Whitelist Rules

```http
GET /whitelist
```

**Response (`200 OK`)**:

```json
[
  {
    "id": 1,
    "type": "telegram",
    "value": "123456789",
    "label": "@suphakit",
    "enabled": true,
    "created_at": "2026-10-25T00:00:00.000Z"
  },
  {
    "id": 2,
    "type": "discord",
    "value": "987654321012345678",
    "label": "George#1234",
    "enabled": true,
    "created_at": "2026-10-25T00:00:00.000Z"
  }
]
```

#### Add User ID to Whitelist

```http
POST /whitelist
Content-Type: application/json

{
  "type": "telegram",
  "value": "123456789",
  "label": "@suphakit"
}
```

**Response (`201 Created`)**:

```json
{
  "id": 3,
  "type": "telegram",
  "value": "123456789",
  "label": "@suphakit",
  "enabled": true,
  "created_at": "2026-10-25T03:30:00.000Z"
}
```

#### Delete Whitelist Rule

```http
DELETE /whitelist/:id
```

**Response (`200 OK`)**:

```json
{
  "success": true,
  "identifier": "123456789"
}
```

---

## Bot Commands

Both Telegram (`/todo ...`, `/category ...`) and Discord (`!todo ...`, `!category ...`) bots support equivalent commands:

| Command (Discord) | Command (Telegram) | Arguments | Access | Description |
| --- | --- | --- | --- | --- |
| `!todo help` | `/todo help`, `/help`, `/start` | None | **Public** | Show command list, usage, and your User ID |
| `!todo` or `!todo list` | `/todo` or `/todo list` | `[category]` | **Public** | List all todo items (optionally filtered by category) |
| `!category` or `!category list` | `/category` or `/category list` | None | **Public** | List all categories with task counts |
| `!todo add` | `/todo add` | `[category] <title>` | **Whitelist** | Create a new todo item with optional category |
| `!todo done` | `/todo done` | `<id>` | **Whitelist** | Mark a todo item as completed |
| `!todo undone` | `/todo undone` | `<id>` | **Whitelist** | Mark a todo item as incomplete |
| `!todo del` | `/todo del` | `<id>` | **Whitelist** | Delete a todo item by ID |
| `!category add` | `/category add` | `<name>` | **Whitelist** | Create a new category |
| `!category del` | `/category del` | `<name\|id>` | **Whitelist** | Delete a category |

> [!NOTE]
> Bot Whitelisting is managed strictly through the **Website Dashboard** (`/dashboard`) and REST API. Any user can view `help` and `list` tasks/categories, while mutation actions (`add`, `done`, `undone`, `del`, category edits) require the user's Telegram or Discord ID to be whitelisted.
