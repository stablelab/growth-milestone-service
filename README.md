# Growth Milestone Backend Package

**Standalone TypeScript/Express routes for milestone management**


### 2. Install Dependencies

```bash
pnpm add axios uuid
pnpm add -D @types/uuid
```

### 3. Register Routes

In `backend/src/routes/index.ts` (or your main router):

```typescript
import milestoneRoutes from './milestones.routes';

// Register milestone routes
app.use('/api/milestones', milestoneRoutes);
```

### 4. Environment Variables

Add to `backend/.env`:

```bash
# Forse Service Configuration
FORSE_SERVICE_URL=http://localhost:8000
FORSE_API_KEY=forse-key-abc123xyz789
GROWTH_API_KEY=growth-key-xyz789abc123
MILESTONE_STORAGE_FILE=./data/milestones.json
```

### 5. Create Data Directory

```bash
mkdir -p backend/data
```

### 6. Test

```bash
# Start your backend
pnpm --filter backend dev

# Test health endpoint
curl http://localhost:3001/api/milestones/health

# Should return: {"status": "healthy", ...}
```

## 🎯 What This Does

### Creates Growth-Side Milestone Management

- **Generates UUIDs** - Your backend creates `milestone_uid` (primary identifier)
- **Syncs to Forse** - Communicates with Forse service for evaluation
- **Receives Webhooks** - Gets completion notifications from Forse
- **Stores Data** - Uses JSON files (easily upgradeable to PostgreSQL)
- **Full CRUD** - Create, Read, Update, Delete milestones

### UID Tracking

```typescript
// When you create a milestone:
POST /api/milestones
{
  "project_id": "project_123",
  "kpi_id": "tvl",
  "target": 1000000
}

// You get back:
{
  "milestone_uid": "550e8400-...",        // ← YOUR UUID (Growth generates)
  "forse_milestone_id": "m_abc123...",   // ← Forse's ID (for sync)
  "status": "created",
  "forse_synced": true
}

// Use milestone_uid everywhere in your app!
```

## 📡 API Endpoints

All endpoints require `X-API-Key` header.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/milestones/health` | Health check |
| POST | `/api/milestones` | Create milestone (generates UUID) |
| GET | `/api/milestones/:uid` | Get milestone by UUID |
| GET | `/api/milestones` | List all milestones |
| PATCH | `/api/milestones/:uid` | Update milestone |
| DELETE | `/api/milestones/:uid` | Delete milestone |
| POST | `/api/milestones/webhooks/milestone-complete` | Webhook from Forse |

See [API.md](API.md) for detailed documentation.

## 🔄 How It Works

```
1. ADMIN CREATES MILESTONE
   Your UI → POST /api/milestones
   
2. BACKEND GENERATES UUID
   milestone_uid = uuid.v4()
   
3. BACKEND SYNCS TO FORSE
   POST http://forse:8000/milestones
   
4. FORSE CREATES & RETURNS ID
   forse_milestone_id = "m_abc123"
   
5. BACKEND STORES BOTH IDs
   {
     milestone_uid: "550e...",
     forse_milestone_id: "m_abc123"
   }
   
6. RETURN TO UI
   milestone_uid for tracking

LATER, WHEN MILESTONE COMPLETES:

7. FORSE SENDS WEBHOOK
   POST /api/milestones/webhooks/milestone-complete
   
8. BACKEND UPDATES STATUS
   Find by forse_milestone_id
   Update completion status
   
9. UI SHOWS COMPLETION
   Poll or websocket to display
```

## 💡 Frontend Integration

```typescript
// Create milestone
const milestone = await fetch('/api/milestones', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NEXT_PUBLIC_GROWTH_API_KEY!
  },
  body: JSON.stringify({
    project_id: projectId,
    kpi_id: 'tvl',
    target: 1000000,
    sync_to_forse: true
  })
}).then(r => r.json());

// Save the milestone_uid in your project
await updateProject(projectId, {
  milestone_uid: milestone.milestone_uid
});

// Later, check status
const status = await fetch(`/api/milestones/${milestone_uid}`, {
  headers: { 'X-API-Key': API_KEY }
}).then(r => r.json());

console.log(`Status: ${status.status}`);
console.log(`Progress: ${status.current_value}/${status.target}`);
```

See [examples/frontend-example.ts](examples/frontend-example.ts) for more.

## 🗄️ Storage Options

### Default: JSON Files

Simple, works immediately, perfect for testing.

```typescript
// Data stored in: backend/data/milestones.json
{
  "milestones": {
    "550e8400-...": {
      "milestone_uid": "550e8400-...",
      "forse_milestone_id": "m_abc123",
      "project_id": "project_123",
      "status": "completed",
      ...
    }
  }
}
```

### Upgrade: PostgreSQL

For production, switch to database:

```typescript
// Replace storage functions in milestones.routes.ts
import { knex } from '../db';

async function getMilestone(milestone_uid: string) {
  return knex('milestones').where({ milestone_uid }).first();
}

async function saveMilestone(milestone_uid: string, data: MilestoneData) {
  return knex('milestones')
    .insert({ ...data, milestone_uid })
    .onConflict('milestone_uid')
    .merge();
}
```

Migration provided in [docs/database-migration.sql](docs/database-migration.sql).

## 🔧 Configuration

### Required Environment Variables

```bash
FORSE_SERVICE_URL=http://localhost:8000     # Forse service URL
FORSE_API_KEY=forse-key-abc123xyz789       # API key for Forse
GROWTH_API_KEY=growth-key-xyz789abc123     # API key for your backend
MILESTONE_STORAGE_FILE=./data/milestones.json  # Where to store data
```

### Optional Configuration

```typescript
// In milestones.routes.ts, you can customize:
const STORAGE_FILE = process.env.MILESTONE_STORAGE_FILE || 
  path.join(process.cwd(), 'data', 'milestones.json');
```

## 🧪 Testing

### Run Unit Tests

```bash
pnpm test
```

### Manual API Testing

```bash
cd tests
./test-requests.sh
```

### Integration Testing

See [INTEGRATION.md](INTEGRATION.md) for complete testing guide.

## 📚 Documentation

- **[INTEGRATION.md](INTEGRATION.md)** - Complete integration guide
- **[API.md](API.md)** - Full API reference with examples
- **[docs/UID-TRACKING.md](docs/UID-TRACKING.md)** - How UID tracking works
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues & fixes
- **[examples/](examples/)** - Code examples for frontend & backend

## 🚨 Important Notes

### 1. Forse Service Required

The Forse service (Python) must be running for milestone creation to work.

```bash
# Start Forse service
cd /path/to/forse-milestone-service
uvicorn forse_service_v2:app --port 8000
```

### 2. API Keys Must Match

The `GROWTH_API_KEY` must match between:
- Your backend `.env`
- Forse service `forse.env`

### 3. Webhook URL

Configure Forse with your backend's webhook URL:

```bash
# In forse.env
GROWTH_WEBHOOK_URL=http://localhost:3001/api/milestones/webhooks/milestone-complete
GROWTH_API_KEY=growth-key-xyz789abc123  # Same as backend
```

