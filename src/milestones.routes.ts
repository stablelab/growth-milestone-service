import { Router, Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Configuration
const FORSE_SERVICE_URL = process.env.FORSE_SERVICE_URL || 'http://localhost:8000';
const FORSE_API_KEY = process.env.FORSE_API_KEY || 'forse-key-abc123xyz789';
const GROWTH_API_KEY = process.env.GROWTH_API_KEY || 'growth-key-xyz789abc123';
const STORAGE_FILE = process.env.MILESTONE_STORAGE_FILE || 
  path.join(process.cwd(), 'data', 'milestones.json');

// Types
interface MilestoneCreateRequest {
  project_id: string;
  kpi_id: string;
  target: number;
  milestone_index?: number;
  timeframe_from?: string;
  timeframe_to?: string;
  scopes?: string[];
  metadata?: Record<string, any>;
  sync_to_forse?: boolean;
}

interface MilestoneData {
  milestone_uid: string;
  forse_milestone_id?: string;
  project_id: string;
  kpi_id: string;
  target: number;
  milestone_index: number;
  timeframe_from?: string;
  timeframe_to?: string;
  scopes?: string[];
  metadata?: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed';
  forse_synced: boolean;
  is_completed: boolean;
  completed_at?: string;
  current_value: number;
  created_at: string;
  updated_at: string;
}

interface CompletionWebhook {
  milestone_id: string;
  status: string;
  current_value: number;
  target: number;
  completed_at: string;
  metadata: Record<string, any>;
}

interface StorageData {
  milestones: Record<string, MilestoneData>;
  metadata: {
    created: string;
    last_updated?: string;
  };
}

// Storage helpers
async function initStorage(): Promise<void> {
  try {
    await fs.access(STORAGE_FILE);
  } catch {
    // File doesn't exist, create it
    const dir = path.dirname(STORAGE_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    const initialData: StorageData = {
      milestones: {},
      metadata: {
        created: new Date().toISOString()
      }
    };
    
    await fs.writeFile(STORAGE_FILE, JSON.stringify(initialData, null, 2));
  }
}

async function readStorage(): Promise<StorageData> {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      milestones: {},
      metadata: { created: new Date().toISOString() }
    };
  }
}

async function writeStorage(data: StorageData): Promise<void> {
  data.metadata.last_updated = new Date().toISOString();
  await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
}

async function getMilestone(milestone_uid: string): Promise<MilestoneData | null> {
  const data = await readStorage();
  return data.milestones[milestone_uid] || null;
}

async function saveMilestone(milestone_uid: string, milestoneData: MilestoneData): Promise<void> {
  const data = await readStorage();
  data.milestones[milestone_uid] = milestoneData;
  await writeStorage(data);
}

async function deleteMilestoneFromStorage(milestone_uid: string): Promise<boolean> {
  const data = await readStorage();
  if (data.milestones[milestone_uid]) {
    delete data.milestones[milestone_uid];
    await writeStorage(data);
    return true;
  }
  return false;
}

// Forse integration helpers
async function syncToForse(request: MilestoneCreateRequest): Promise<{ milestone_id: string }> {
  const response = await axios.post(
    `${FORSE_SERVICE_URL}/milestones`,
    {
      project_id: request.project_id,
      kpi_id: request.kpi_id,
      target: request.target,
      milestone_index: request.milestone_index || 1,
      timeframe_from: request.timeframe_from,
      timeframe_to: request.timeframe_to,
      scopes: request.scopes || []
    },
    {
      headers: {
        'X-API-Key': FORSE_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return { milestone_id: response.data.milestone_id };
}

async function updateInForse(forse_milestone_id: string, target: number): Promise<any> {
  const response = await axios.patch(
    `${FORSE_SERVICE_URL}/milestones/${forse_milestone_id}`,
    null,
    {
      params: { target },
      headers: { 'X-API-Key': FORSE_API_KEY }
    }
  );
  
  return response.data;
}

async function deleteFromForse(forse_milestone_id: string): Promise<boolean> {
  try {
    await axios.delete(
      `${FORSE_SERVICE_URL}/milestones/${forse_milestone_id}`,
      {
        headers: { 'X-API-Key': FORSE_API_KEY }
      }
    );
    return true;
  } catch {
    return false;
  }
}

// Middleware: API Key authentication
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey !== GROWTH_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Initialize storage on load
initStorage().catch(console.error);

// Routes

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'growth-milestone-service',
    storage: STORAGE_FILE,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /milestones
 * Create a new milestone
 * 
 * Flow:
 * 1. Generate UUID in Growth (this is the primary identifier)
 * 2. Sync to Forse (get Forse's milestone_id)
 * 3. Store both IDs in Growth storage
 */
router.post('/milestones', requireApiKey, async (req: Request, res: Response) => {
  try {
    const request: MilestoneCreateRequest = req.body;
    
    // Validate required fields
    if (!request.project_id || !request.kpi_id || request.target === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: project_id, kpi_id, target' 
      });
    }
    
    // 1. Generate Growth's UUID (primary identifier)
    const milestone_uid = uuidv4();
    
    // 2. Sync to Forse (if requested)
    let forse_milestone_id: string | undefined;
    const sync_to_forse = request.sync_to_forse !== false; // Default true
    
    if (sync_to_forse) {
      try {
        const forseResponse = await syncToForse(request);
        forse_milestone_id = forseResponse.milestone_id;
      } catch (error) {
        console.error('Failed to sync to Forse:', error);
        return res.status(500).json({ 
          error: 'Failed to create milestone in Forse',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // 3. Store in Growth with both IDs
    const milestoneData: MilestoneData = {
      milestone_uid,
      forse_milestone_id,
      project_id: request.project_id,
      kpi_id: request.kpi_id,
      target: request.target,
      milestone_index: request.milestone_index || 1,
      timeframe_from: request.timeframe_from,
      timeframe_to: request.timeframe_to,
      scopes: request.scopes,
      metadata: request.metadata,
      status: 'pending',
      forse_synced: sync_to_forse,
      is_completed: false,
      current_value: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await saveMilestone(milestone_uid, milestoneData);
    
    res.status(201).json({
      milestone_uid,
      forse_milestone_id,
      status: 'created',
      forse_synced: sync_to_forse
    });
    
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ 
      error: 'Failed to create milestone',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /milestones/:milestone_uid
 * Get milestone details
 */
router.get('/milestones/:milestone_uid', requireApiKey, async (req: Request, res: Response) => {
  try {
    const { milestone_uid } = req.params;
    const milestone = await getMilestone(milestone_uid);
    
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    res.json(milestone);
    
  } catch (error) {
    console.error('Error fetching milestone:', error);
    res.status(500).json({ error: 'Failed to fetch milestone' });
  }
});

/**
 * GET /milestones
 * List all milestones (with optional filters)
 */
router.get('/milestones', requireApiKey, async (req: Request, res: Response) => {
  try {
    const { project_id, status } = req.query;
    const data = await readStorage();
    
    let milestones = Object.values(data.milestones);
    
    // Apply filters
    if (project_id) {
      milestones = milestones.filter(m => m.project_id === project_id);
    }
    if (status) {
      milestones = milestones.filter(m => m.status === status);
    }
    
    res.json({
      total: milestones.length,
      milestones
    });
    
  } catch (error) {
    console.error('Error listing milestones:', error);
    res.status(500).json({ error: 'Failed to list milestones' });
  }
});

/**
 * PATCH /milestones/:milestone_uid
 * Update milestone (e.g., change target)
 */
router.patch('/milestones/:milestone_uid', requireApiKey, async (req: Request, res: Response) => {
  try {
    const { milestone_uid } = req.params;
    const { target, sync_to_forse = true } = req.body;
    
    const milestone = await getMilestone(milestone_uid);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    const old_target = milestone.target;
    
    // Update in Forse if synced
    let forse_effect;
    if (sync_to_forse && milestone.forse_synced && milestone.forse_milestone_id) {
      try {
        forse_effect = await updateInForse(milestone.forse_milestone_id, target);
        milestone.status = forse_effect.new_status || milestone.status;
      } catch (error) {
        console.error('Failed to update in Forse:', error);
      }
    }
    
    // Update in Growth
    milestone.target = target;
    milestone.updated_at = new Date().toISOString();
    
    await saveMilestone(milestone_uid, milestone);
    
    res.json({
      milestone_uid,
      status: 'updated',
      old_target,
      new_target: target,
      forse_effect
    });
    
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

/**
 * DELETE /milestones/:milestone_uid
 * Delete milestone
 */
router.delete('/milestones/:milestone_uid', requireApiKey, async (req: Request, res: Response) => {
  try {
    const { milestone_uid } = req.params;
    const { delete_from_forse = true } = req.query;
    
    const milestone = await getMilestone(milestone_uid);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    // Delete from Forse if synced
    let forse_deleted = false;
    if (delete_from_forse && milestone.forse_synced && milestone.forse_milestone_id) {
      forse_deleted = await deleteFromForse(milestone.forse_milestone_id);
    }
    
    // Delete from Growth
    const success = await deleteMilestoneFromStorage(milestone_uid);
    
    res.json({
      milestone_uid,
      status: 'deleted',
      forse_deleted
    });
    
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

/**
 * POST /webhooks/milestone-complete
 * Webhook endpoint to receive completion notifications from Forse
 * 
 * Called by Forse service when a milestone completes
 */
router.post('/webhooks/milestone-complete', requireApiKey, async (req: Request, res: Response) => {
  try {
    const webhook: CompletionWebhook = req.body;
    
    // Find milestone by forse_milestone_id
    const data = await readStorage();
    const milestone = Object.values(data.milestones).find(
      m => m.forse_milestone_id === webhook.milestone_id
    );
    
    if (!milestone) {
      console.warn(`Webhook for unknown milestone: ${webhook.milestone_id}`);
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    // Update milestone
    milestone.status = webhook.status as any;
    milestone.is_completed = webhook.status === 'completed';
    milestone.completed_at = webhook.status === 'completed' ? webhook.completed_at : undefined;
    milestone.current_value = webhook.current_value;
    milestone.updated_at = new Date().toISOString();
    
    await saveMilestone(milestone.milestone_uid, milestone);
    
    console.log(`✅ Webhook received for ${milestone.milestone_uid}: ${webhook.status}`);
    
    res.json({
      status: 'received',
      milestone_uid: milestone.milestone_uid,
      updated: true
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

/**
 * GET /export
 * Export all milestone data (for backup/inspection)
 */
router.get('/export', requireApiKey, async (req: Request, res: Response) => {
  try {
    const data = await readStorage();
    res.json(data);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;

