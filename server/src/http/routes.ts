import {
  DEFAULT_LANG,
  LANGS,
  type CreateTaskResponse,
  type HealthResponse,
  type PublicTeam,
  type Task,
} from '@agent-office/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../env';
import { MAX_NOTE_LENGTH, type Orchestrator } from '../orchestrator/orchestrator';
import { toPublicTeam, type TeamRegistry } from '../teams/loader';
import { HttpError, parseBody } from './errors';
import { streamTask } from './sse';

export const APP_VERSION = '0.1.0';

const CreateTaskBody = z.object({
  teamId: z.string().min(1),
  prompt: z.string().trim().min(3).max(4000),
  lang: z.enum(LANGS).default(DEFAULT_LANG),
});

const ReviseBody = z.object({
  note: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});

export interface ApiDeps {
  env: Env;
  teams: TeamRegistry;
  orchestrator: Orchestrator;
}

export function apiRouter({ env, teams, orchestrator }: ApiDeps): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    const body: HealthResponse = { ok: true, provider: env.LLM_PROVIDER, version: APP_VERSION };
    res.json(body);
  });

  // ---- teams
  api.get('/teams', (_req, res) => {
    const body: PublicTeam[] = teams.list().map(toPublicTeam);
    res.json(body);
  });

  api.get('/teams/:teamId', (req, res) => {
    const team = teams.get(req.params.teamId);
    if (!team) throw new HttpError(404, 'not_found', `Unknown team "${req.params.teamId}"`);
    res.json(toPublicTeam(team) satisfies PublicTeam);
  });

  // ---- tasks
  api.post('/tasks', (req, res) => {
    const body = parseBody(CreateTaskBody, req.body);
    const task = orchestrator.createTask(body);
    res.status(201).json({ taskId: task.id } satisfies CreateTaskResponse);
  });

  api.get('/tasks/:taskId', (req, res) => {
    res.json(orchestrator.getTask(req.params.taskId) satisfies Task);
  });

  api.get('/tasks/:taskId/events', (req, res) => {
    streamTask(req, res, orchestrator, req.params.taskId);
  });

  api.post('/tasks/:taskId/cancel', (req, res) => {
    res.json(orchestrator.cancel(req.params.taskId));
  });

  // ---- review decisions on subtasks
  api.post('/tasks/:taskId/subtasks/:subtaskId/approve', (req, res) => {
    res.json(orchestrator.approve(req.params.taskId, req.params.subtaskId));
  });

  api.post('/tasks/:taskId/subtasks/:subtaskId/revise', (req, res) => {
    const { note } = parseBody(ReviseBody, req.body);
    res.json(orchestrator.revise(req.params.taskId, req.params.subtaskId, note));
  });

  api.post('/tasks/:taskId/subtasks/:subtaskId/retry', (req, res) => {
    res.json(orchestrator.retry(req.params.taskId, req.params.subtaskId));
  });

  // ---- review decisions on the final output
  api.post('/tasks/:taskId/final/approve', (req, res) => {
    res.json(orchestrator.approveFinal(req.params.taskId));
  });

  api.post('/tasks/:taskId/final/revise', (req, res) => {
    const { note } = parseBody(ReviseBody, req.body);
    res.json(orchestrator.reviseFinal(req.params.taskId, note));
  });

  api.post('/tasks/:taskId/final/retry', (req, res) => {
    res.json(orchestrator.retryFinal(req.params.taskId));
  });

  api.use((_req, _res) => {
    throw new HttpError(404, 'not_found', 'Unknown API route');
  });

  return api;
}
