/**
 * JSON schema of the coordinator's planning answer, handed to providers that
 * support structured output (Gemini `responseJsonSchema`, Ollama `format`,
 * OpenRouter `response_format`, an Anthropic tool). It is one flat shape for both
 * outcomes, because strict structured-output modes don't accept unions:
 * - `action: "plan"` → `summary` + `subtasks` (reply/questions empty)
 * - `action: "clarify"` → `reply` + `questions` (summary/subtasks empty)
 * The tolerant `planParser` still checks and cleans every answer, so a provider
 * without structured output also works.
 */
export const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['plan', 'clarify'],
      description: '"plan" to split the task, "clarify" to ask the user first.',
    },
    reply: {
      type: 'string',
      description: 'Only for "clarify": one or two friendly sentences to the user.',
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only for "clarify": 1–3 short questions.',
    },
    summary: { type: 'string', description: 'Only for "plan": one or two sentences.' },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          assignee: { type: 'string', description: 'A worker id from the team.' },
          title: { type: 'string' },
          instructions: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'assignee', 'title', 'instructions', 'dependsOn'],
        additionalProperties: false,
      },
    },
  },
  required: ['action', 'reply', 'questions', 'summary', 'subtasks'],
  additionalProperties: false,
} as const;
