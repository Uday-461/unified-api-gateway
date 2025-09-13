# API Gateway

AI API Gateway with credit system using Zuplo for routing and a Node.js control plane for business logic.

## 🏗️ Architecture

- **API Gateway**: Zuplo (Managed service for routing, policies, and edge functions)
- **Control Plane**: Node.js + Express + TypeScript (Business logic, credit management)
- **Database**: PostgreSQL (User accounts, API keys, usage tracking)
- **Local Development**: Docker Compose

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+**
2. **Docker & Docker Compose**
3. **Zuplo CLI** (optional for local Zuplo development)

```bash
npm install -g @zuplo/cli
```

### 1. Clone and Setup

```bash
git clone <repository>
cd api-gateway
npm install
```

### 2. Start Local Development

```bash
# Start PostgreSQL database
docker-compose up -d postgres

# Wait for database to be ready, then start control plane
npm run dev
```

### 3. Setup Database (First Time)

The database schema will be automatically initialized when PostgreSQL starts via `init.sql`.

### 4. Test the Control Plane

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "api-gateway-control-plane"
}
```

## 🛠️ Development Workflow

### Project Structure

```
api-gateway/
├── src/                    # Control Plane API (TypeScript)
│   ├── server.ts          # Main Express server
│   ├── types.ts           # TypeScript interfaces
│   ├── utils.ts           # Utility functions
│   └── database.ts        # Database connection
├── policies/              # Zuplo policies
│   ├── api-key-auth.ts
│   ├── credit-validation.ts
│   ├── request-enrichment.ts
│   └── usage-logging.ts
├── modules/               # Zuplo modules
│   ├── vendor-proxy.ts
│   └── auth.ts
├── config/
│   └── routes.oas.json    # API route definitions
├── tests/
│   └── api.test.ts        # Test suite
├── zuplo.jsonc           # Main Zuplo configuration
├── docker-compose.yml    # Local development setup
└── init.sql             # Database schema
```

### Available Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Build TypeScript
npm start           # Start production server

# Testing & Quality
npm test            # Run Jest tests
npm run test:watch  # Run tests in watch mode
npm run lint        # ESLint
npm run typecheck   # TypeScript type checking

# Database
docker-compose up -d postgres  # Start PostgreSQL
docker-compose down           # Stop all services
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/api_gateway
CONTROL_PLANE_URL=http://localhost:3000
ENCRYPTION_KEY=your-32-char-encryption-key-here
NODE_ENV=development
PORT=3000
```

### Database Schema

The database is automatically initialized with:
- **users**: User accounts with credit balance
- **api_keys**: API key management
- **vendors**: AI service providers (OpenAI, Anthropic)
- **apis**: Available API endpoints with pricing
- **usage_logs**: Request tracking and billing

### Sample Data

Initial vendors and APIs are created automatically:
- **OpenAI**: `gpt-4` ($0.03), `gpt-3.5` ($0.002)
- **Anthropic**: `claude-3` ($0.015)

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Manual API Testing

1. **Create a test user and API key** (use database directly for MVP):

```sql
INSERT INTO users (email, name, credits) VALUES ('test@example.com', 'Test User', 100.00);

INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES
((SELECT id FROM users WHERE email = 'test@example.com'),
 '$2b$10$example_hash_here',
 'zup_test',
 'Test Key');
```

2. **Test API Gateway** (requires Zuplo local dev):

```bash
# Start Zuplo local development
zuplo dev

# Test API call
curl -X POST http://localhost:9000/api/v1/openai/gpt-4 \
  -H "Content-Type: application/json" \
  -H "x-api-key: zup_your_test_key" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

## 🚀 Zuplo Setup (For Full Gateway Testing)

### 1. Create Zuplo Account

1. Go to [https://zuplo.com](https://zuplo.com)
2. Sign up and create a new project
3. Get your API key from the dashboard

### 2. Initialize Zuplo Project

```bash
export ZUPLO_API_KEY="your-api-key"
zuplo link
zuplo dev
```

### 3. Deploy to Zuplo

```bash
git add .
git commit -m "Initial API Gateway setup"
zuplo deploy
```

## 📊 API Endpoints

### Control Plane (Port 3000)

- `POST /auth/validate` - Validate API key for Zuplo
- `POST /credit/validate` - Check user credits and get API config
- `POST /usage/log` - Log API usage and deduct credits
- `GET /user/:id/credits` - Get user credit balance
- `POST /admin/user/:id/credits` - Add credits (admin)
- `GET /health` - Health check

### API Gateway (Via Zuplo)

- `POST /api/v1/{vendor}/{model}` - Proxy to AI APIs
- `GET /api/v1/user/credits` - Get current user credits

### Supported APIs

- `POST /api/v1/openai/gpt-4`
- `POST /api/v1/openai/gpt-3.5`
- `POST /api/v1/anthropic/claude-3`

## 🔒 Security Features

- **API Key Authentication**: Secure API key validation
- **Credit-based Access Control**: Prevents unauthorized usage
- **Request/Response Logging**: Full audit trail
- **Rate Limiting**: Built into Zuplo
- **Input Validation**: Request validation and sanitization

## 📈 Monitoring

### Built-in Logging

All requests are logged with:
- User ID and email
- API endpoint used
- Credits consumed
- Response time
- Success/failure status

### Database Analytics

Query usage patterns:

```sql
-- Top APIs by usage (last 24 hours)
SELECT
  a.name,
  v.name as vendor,
  COUNT(*) as total_calls,
  SUM(ul.credits_used) as total_credits
FROM usage_logs ul
JOIN apis a ON ul.api_id = a.id
JOIN vendors v ON a.vendor_id = v.id
WHERE ul.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY a.id, a.name, v.name
ORDER BY total_calls DESC;
```

## 🐳 Production Deployment

### Docker Production Build

```bash
docker build -t api-gateway .
docker run -p 3000:3000 --env-file .env api-gateway
```

### Database Migration

For production, ensure your PostgreSQL instance is set up and run:

```bash
psql $DATABASE_URL < init.sql
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Submit a pull request

## 📄 License

MIT