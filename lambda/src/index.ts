import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAIClient } from './services/ai-client';
import { getReportPrompt } from '../../prompts/report';
import { getCasualPrompt } from '../../prompts/casual';
import { getDailyPrompt } from '../../prompts/daily';
import { getWeeklyPrompt } from '../../prompts/weekly';

type Mode = 'report' | 'casual' | 'daily' | 'weekly';

interface RequestBody {
  mode: Mode;
  input: string;
  context?: string;
}

function getPrompt(mode: Mode): string {
  switch (mode) {
    case 'report':
      return getReportPrompt();
    case 'casual':
      return getCasualPrompt();
    case 'daily':
      return getDailyPrompt();
    case 'weekly':
      return getWeeklyPrompt();
  }
}

function buildUserMessage(input: string, context?: string): string {
  if (context) {
    return `相手のメッセージ:\n${context}\n\n自分が伝えたいこと:\n${input}`;
  }
  return input;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body: RequestBody = JSON.parse(event.body || '{}');
    const { mode, input, context } = body;

    if (!mode || !input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'mode and input are required' }),
      };
    }

    const prompt = getPrompt(mode);
    const client = getAIClient();
    const userMessage = buildUserMessage(input, context);
    const result = await client.generate(prompt, userMessage);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
