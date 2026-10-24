# katz-todo

Todo management service built on Bun with a Hono REST API, PostgreSQL persistence, Redis caching, and integrated Discord and Telegram bots.

## Features

- **Runtime**: Bun with native `Bun.SQL` and `Bun.RedisClient` (zero external DB driver overhead).
- **HTTP API**: High-performance REST API powered by [Hono](https://hono.dev).
- **Caching**: 60-second Redis cache with automated invalidation on mutations.
- **Chatbots**: Simultaneous Telegram (`grammy`) and Discord (`discord.js`) bot integrations.
- **Docker**: Containerized deployment with Dockerfile and Docker Compose.
- **Cross-Compilation**: Native standalone Linux binary build script (`x64`, `arm64`).

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

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/app` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `DOCKER_DATABASE_URL` | PostgreSQL connection string inside Docker container | `postgres://postgres:postgres@host.docker.internal:5432/app` |
| `DOCKER_REDIS_URL` | Redis connection string inside Docker container | `redis://host.docker.internal:6379` |
| `TELEGRAM_TOKEN` | Telegram bot API token (optional) | _empty_ |
| `DISCORD_TOKEN` | Discord bot application token (optional) | _empty_ |

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

### Health Check

```http
GET /
```

**Response (`200 OK`)**:
```text
Hello Hono! Todo service & bots running.
```

### List Todos

```http
GET /todos
```

**Response (`200 OK`)**:
```json
[
  {
    "id": 1,
    "title": "Buy milk",
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
  "title": "Buy milk"
}
```

**Response (`201 Created`)**:
```json
{
  "id": 1,
  "title": "Buy milk",
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
  "completed": true
}
```

**Response (`200 OK`)**:
```json
{
  "id": 1,
  "title": "Buy milk",
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

---

## Bot Commands

Both Telegram and Discord bots support equivalent commands:

| Command (Discord) | Command (Telegram) | Arguments | Description |
| --- | --- | --- | --- |
| `!help` | `/help`, `/start` | None | Show command list and usage |
| `!todos`, `!list` | `/todos`, `/list` | None | List all todo items with completion status |
| `!add` | `/add` | `<title>` | Create a new todo item |
| `!done` | `/done` | `<id>` | Mark a todo item as completed |
| `!undone` | `/undone` | `<id>` | Mark a todo item as incomplete |
| `!del`, `!delete` | `/del` | `<id>` | Delete a todo item by ID |
