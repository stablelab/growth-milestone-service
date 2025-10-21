# API Documentation

Complete API reference for Growth milestone routes.

## Authentication

All endpoints require the `X-API-Key` header:

```http
X-API-Key: growth-key-xyz789abc123
```

## Base URL

```
http://localhost:3001/api/milestones
```

---

## Endpoints

### Health Check

Check if the service is running.

```http
GET /api/milestones/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "growth-milestone-service",
  "storage": "./data/milestones.json",
  "timestamp": "2025-10-21T14:30:00.000Z"
}
```

---

### Create Milestone

Create a new milestone. Growth generates the `milestone_uid`.

```http
POST /api/milestones
X-API-Key: growth-key-xyz789abc123
Content-Type: application/json
```

**Request Body:**
```json
{
  "project_id": "project_123",
  "kpi_id": "tvl",
  "target": 1000000,
  "milestone_index": 1,
  "timeframe_from": "2025-01-01",
  "timeframe_to": "2025-12-31",
  "scopes": ["polygon"],
  "metadata": {
    "project_name": "DeFi Protocol"
  },
  "sync_to_forse": true
}
```

**Response (201 Created):**
```json
{
  "milestone_uid": "550e8400-e29b-41d4-a716-446655440000",
  "forse_milestone_id": "m_abc123xyz789",
  "status": "created",
  "forse_synced": true
}
```

**Key Fields:**
- `milestone_uid` - **YOUR primary identifier** (UUID v4)
- `forse_milestone_id` - Forse's internal ID (for sync)
- `forse_synced` - Whether successfully synced to Forse

---

### Get Milestone

Get milestone details by UID.

```http
GET /api/milestones/:milestone_uid
X-API-Key: growth-key-xyz789abc123
```

**Response:**
```json
{
  "milestone_uid": "550e8400-e29b-41d4-a716-446655440000",
  "forse_milestone_id": "m_abc123xyz789",
  "project_id": "project_123",
  "kpi_id": "tvl",
  "target": 1000000,
  "milestone_index": 1,
  "timeframe_from": "2025-01-01",
  "timeframe_to": "2025-12-31",
  "scopes": ["polygon"],
  "metadata": {
    "project_name": "DeFi Protocol"
  },
  "status": "in_progress",
  "forse_synced": true,
  "is_completed": false,
  "completed_at": null,
  "current_value": 750000,
  "created_at": "2025-10-21T10:00:00.000Z",
  "updated_at": "2025-10-21T14:30:00.000Z"
}
```

---

### List Milestones

List all milestones with optional filtering.

```http
GET /api/milestones?project_id=project_123&status=completed
X-API-Key: growth-key-xyz789abc123
```

**Query Parameters:**
- `project_id` (optional) - Filter by project
- `status` (optional) - Filter by status: `pending`, `in_progress`, `completed`

**Response:**
```json
{
  "total": 2,
  "milestones": [
    {
      "milestone_uid": "550e8400-...",
      "project_id": "project_123",
      "status": "completed",
      ...
    },
    {
      "milestone_uid": "660e8400-...",
      "project_id": "project_123",
      "status": "in_progress",
      ...
    }
  ]
}
```

---

### Update Milestone

Update milestone (typically to change target).

```http
PATCH /api/milestones/:milestone_uid
X-API-Key: growth-key-xyz789abc123
Content-Type: application/json
```

**Request Body:**
```json
{
  "target": 1500000,
  "sync_to_forse": true
}
```

**Response:**
```json
{
  "milestone_uid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "updated",
  "old_target": 1000000,
  "new_target": 1500000,
  "forse_effect": {
    "milestone_id": "m_abc123xyz789",
    "old_status": "completed",
    "new_status": "in_progress",
    "old_target": 1000000,
    "new_target": 1500000,
    "current_value": 1050000,
    "status_changed": true
  }
}
```

**Note:** If `sync_to_forse: true`, Forse immediately re-evaluates and returns the effect.

---

### Delete Milestone

Delete milestone from both systems.

```http
DELETE /api/milestones/:milestone_uid?delete_from_forse=true
X-API-Key: growth-key-xyz789abc123
```

**Query Parameters:**
- `delete_from_forse` (optional, default: true) - Also delete from Forse

**Response:**
```json
{
  "milestone_uid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "deleted",
  "forse_deleted": true
}
```

---

### Completion Webhook (Forse → Growth)

**This endpoint is called BY FORSE, not by you.**

Receives completion notifications from Forse service.

```http
POST /api/milestones/webhooks/milestone-complete
X-API-Key: growth-key-xyz789abc123
Content-Type: application/json
```

**Request Body (from Forse):**
```json
{
  "milestone_id": "m_abc123xyz789",
  "status": "completed",
  "current_value": 1050000,
  "target": 1000000,
  "completed_at": "2025-10-21T14:30:00.000Z",
  "metadata": {
    "team_id": "team_123",
    "kpi_id": "tvl"
  }
}
```

**Response:**
```json
{
  "status": "received",
  "milestone_uid": "550e8400-e29b-41d4-a716-446655440000",
  "updated": true
}
```

**Flow:**
1. Forse detects milestone completion
2. Forse sends POST to this webhook
3. Backend finds milestone by `forse_milestone_id`
4. Backend updates status, current_value, completed_at
5. Backend responds with confirmation

---

### Export Data

Export all milestone data (for backup/inspection).

```http
GET /api/milestones/export
X-API-Key: growth-key-xyz789abc123
```

**Response:**
```json
{
  "milestones": {
    "550e8400-...": { ... },
    "660e8400-...": { ... }
  },
  "metadata": {
    "created": "2025-10-21T10:00:00.000Z",
    "last_updated": "2025-10-21T14:30:00.000Z"
  }
}
```

---

## Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Milestone created, no activity yet |
| `in_progress` | Some progress made, not yet at target |
| `completed` | Target reached |

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Invalid API key"
}
```

### 404 Not Found

```json
{
  "error": "Milestone not found"
}
```

### 400 Bad Request

```json
{
  "error": "Missing required fields: project_id, kpi_id, target"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create milestone",
  "details": "Connection refused to Forse service"
}
```

---

## Complete Examples

### Create and Track Milestone

```bash
# 1. Create milestone
MILESTONE=$(curl -s -X POST http://localhost:3001/api/milestones \
  -H "X-API-Key: growth-key-xyz789abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "project_123",
    "kpi_id": "tvl",
    "target": 1000000,
    "sync_to_forse": true
  }')

# Extract milestone_uid
MILESTONE_UID=$(echo "$MILESTONE" | jq -r '.milestone_uid')
echo "Created: $MILESTONE_UID"

# 2. Check status
curl -s "http://localhost:3001/api/milestones/$MILESTONE_UID" \
  -H "X-API-Key: growth-key-xyz789abc123" | jq '.'

# 3. Update target
curl -s -X PATCH "http://localhost:3001/api/milestones/$MILESTONE_UID" \
  -H "X-API-Key: growth-key-xyz789abc123" \
  -H "Content-Type: application/json" \
  -d '{"target": 1500000, "sync_to_forse": true}' | jq '.'

# 4. Delete when done
curl -s -X DELETE "http://localhost:3001/api/milestones/$MILESTONE_UID" \
  -H "X-API-Key: growth-key-xyz789abc123" | jq '.'
```

### Frontend Integration

```typescript
// api/milestones.ts
export async function createMilestone(data: {
  project_id: string;
  kpi_id: string;
  target: number;
}) {
  const response = await fetch('/api/milestones', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.NEXT_PUBLIC_GROWTH_API_KEY!
    },
    body: JSON.stringify({
      ...data,
      sync_to_forse: true
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create milestone');
  }
  
  return response.json();
}

export async function getMilestoneStatus(milestone_uid: string) {
  const response = await fetch(`/api/milestones/${milestone_uid}`, {
    headers: {
      'X-API-Key': process.env.NEXT_PUBLIC_GROWTH_API_KEY!
    }
  });
  
  return response.json();
}

// Usage in component
const handleCreateMilestone = async () => {
  const result = await createMilestone({
    project_id: projectId,
    kpi_id: 'tvl',
    target: 1000000
  });
  
  // Save milestone_uid in your project
  await updateProject(projectId, {
    milestone_uid: result.milestone_uid
  });
};
```

---

## Rate Limiting

**Recommended limits:**
- Normal endpoints: 100 requests/minute
- Webhook endpoint: 1000 requests/minute

Implement in your backend as needed.

---

## Webhook Configuration

For webhooks to work, configure Forse service with your backend URL:

```bash
# In Forse service forse.env
GROWTH_WEBHOOK_URL=http://your-backend:3001/api/milestones/webhooks/milestone-complete
GROWTH_API_KEY=growth-key-xyz789abc123  # Must match your backend
```

---

## Production Checklist

- [ ] Use strong, random API keys (32+ characters)
- [ ] Enable HTTPS for all communication
- [ ] Set up rate limiting
- [ ] Configure webhook retry logic in Forse
- [ ] Switch from JSON to database storage
- [ ] Set up log aggregation
- [ ] Monitor webhook delivery
- [ ] Set up alerts for failures

---

For more details, see [INTEGRATION.md](INTEGRATION.md).

