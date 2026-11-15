/**
 * JSON schema of the coordinator's plan, handed to providers that support
 * structured output (Gemini `responseJsonSchema`, Ollama `format`, OpenRouter
 * `response_format`, an Anthropic tool). The tolerant `planParser` still checks
 * and cleans every answer, so a provider without structured output also works.
 */
export const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentences about the plan.' },
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
  required: ['summary', 'subtasks'],
  additionalProperties: false,
} as const;
