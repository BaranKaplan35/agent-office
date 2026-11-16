import {
  DEFAULT_LANG,
  LANGS,
  type CreateTaskResponse,
  type HealthResponse,
  type PublicTeam,
  type Task,
  type TeamConfig,
} from '@agent-office/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../env';
import type { PreflightProblem } from '../llm/preflight';
import { resolveModel } from '../llm/resolve';
import { MAX_NOTE_LENGTH, type Orchestrator } from '../orchestrator/orchestrator';
import { toPublicTeam, type TeamRegistry } from '../teams/loader';
import { HttpError, parseBody } from './errors';
import { streamTask } from './sse';

export const APP_VERSION = '0.1.0';

const CreateTaskBody = z.object({
  teamId: z.string().min(1),
  // Short inputs are allowed: for "hi" the coordinator asks what to do.
  prompt: z.string().trim().min(1).max(4000),
  lang: z.enum(LANGS).default(DEFAULT_LANG),
});

const ReviseBody = z.object({
  note: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});

const ClarifyBody = z.object({
  answer: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});

export interface ApiDeps {
  env: Env;
  teams: TeamRegistry;
  orchestrator: Orchestrator;
  /** Agents whose model can't be used right now (from the preflight). */
  problems?: () => ReadonlyArray<PreflightProblem>;
}

export function apiRouter({ env, teams, orchestrator, problems = () => [] }: ApiDeps): Router {
  const api = Router();

  const publicTeam = (team: TeamConfig): PublicTeam =>
    toPublicTeam(team, {
      resolve: (agent) => resolveModel(agent, env),
      unavailable: new Map(
        problems()
          .filter((p) => p.teamId === team.id)
          .map((p) => [p.agentId, p.reason]),
      ),
    });

  api.get('/health', (_req, res) => {
    const body: HealthResponse = { ok: true, provider: env.LLM_PROVIDER, version: APP_VERSION };
    res.json(body);
  });

  // ---- teams
  api.get('/teams', (_req, res) => {
    const body: PublicTeam[] = teams.list().map(publicTeam);
    res.json(body);
  });

  api.get('/teams/:teamId', (req, res) => {
    const team = teams.get(req.params.teamId);
    if (!team) throw new HttpError(404, 'not_found', `Unknown team "${req.params.teamId}"`);
    res.json(publicTeam(team));
  });

  // ---- tasks
  api.post('/tasks', (req, res) => {
    const body = parseBody(CreateTaskBody, req.body);
    const blocked = problems().filter((p) => p.teamId === body.teamId);
    if (blocked.length > 0) {
      const who = blocked.map((p) => `${p.agentName} (${p.provider}:${p.model}): ${p.reason}`);
      throw new HttpError(
        409,
        'team_unavailable',
        `This team can't run right now. ${who.join('; ')}`,
      );
    }
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

  // ---- planning failed (model down, quota): plan again with the same prompt and answers
  api.post('/tasks/:taskId/plan/retry', (req, res) => {
    res.json(orchestrator.retryPlanning(req.params.taskId));
  });

  // ---- the coordinator asked before planning; the user answers
  api.post('/tasks/:taskId/clarify', (req, res) => {
    const { answer } = parseBody(ClarifyBody, req.body);
    res.json(orchestrator.answerClarification(req.params.taskId, answer));
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
