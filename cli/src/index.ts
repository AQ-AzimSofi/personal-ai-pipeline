#!/usr/bin/env node
import { Command } from 'commander';
import { select, editor, input } from '@inquirer/prompts';

const program = new Command();

async function callViaApi(mode: string, input: string, context?: string): Promise<string> {
  const apiUrl = process.env.AIP_API_URL!;
  const res = await fetch(`${apiUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, input, context }),
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { result: string };
  return data.result;
}

async function callDirect(mode: string, userInput: string, context?: string): Promise<string> {
  const { getAIClient } = await import('../../lambda/src/services/ai-client');
  const { getReportPrompt } = await import('../../prompts/report');
  const { getCasualPrompt } = await import('../../prompts/casual');
  const { getDailyPrompt } = await import('../../prompts/daily');
  const { getWeeklyPrompt } = await import('../../prompts/weekly');

  const client = getAIClient();
  const prompts: Record<string, () => string> = {
    report: getReportPrompt,
    casual: getCasualPrompt,
    daily: getDailyPrompt,
    weekly: getWeeklyPrompt,
  };
  const systemPrompt = (prompts[mode] ?? getReportPrompt)();

  const userMessage = context
    ? `相手のメッセージ:\n${context}\n\n自分が伝えたいこと:\n${userInput}`
    : userInput;

  return client.generate(systemPrompt, userMessage);
}

async function generate(mode: string, userInput: string, context?: string): Promise<string> {
  if (process.env.AIP_API_URL) {
    return callViaApi(mode, userInput, context);
  }
  return callDirect(mode, userInput, context);
}

async function interactiveMode(): Promise<void> {
  const mode = await select({
    message: 'Mode:',
    choices: [
      { name: 'report  - 業務報告', value: 'report' },
      { name: 'casual  - カジュアル返信', value: 'casual' },
      { name: 'daily   - 日報 (TIL)', value: 'daily' },
      { name: 'weekly  - 週報 (KPT)', value: 'weekly' },
    ],
  });

  let context: string | undefined;
  if (mode === 'casual') {
    context = await input({
      message: '相手のメッセージ (任意、なければEnter):',
    }) || undefined;
  }

  const userInput = await editor({
    message: 'テキストを入力 (エディタが開きます):',
  });

  if (!userInput.trim()) {
    console.log('Input is empty.');
    return;
  }

  console.log('\nGenerating...\n');
  const result = await generate(mode, userInput.trim(), context);
  console.log('─'.repeat(50));
  console.log(result);
  console.log('─'.repeat(50));
}

program
  .name('aip')
  .description('Personal AI Pipeline CLI')
  .version('0.1.0');

program
  .command('interactive', { isDefault: true })
  .description('Interactive mode')
  .action(interactiveMode);

program
  .command('report')
  .description('Generate a work report')
  .argument('<input...>', 'Report content')
  .action(async (inputParts: string[]) => {
    const userInput = inputParts.join(' ');
    console.log('Generating report...\n');
    const result = await generate('report', userInput);
    console.log(result);
  });

program
  .command('casual')
  .description('Generate a casual reply')
  .option('-c, --context <message>', 'The message you are replying to')
  .argument('<input...>', 'What you want to say')
  .action(async (inputParts: string[], options: { context?: string }) => {
    const userInput = inputParts.join(' ');
    console.log('Generating reply...\n');
    const result = await generate('casual', userInput, options.context);
    console.log(result);
  });

program
  .command('daily')
  .description('Generate a daily report (nippou)')
  .argument('<input...>', 'Bullet points of what you did today')
  .action(async (inputParts: string[]) => {
    const userInput = inputParts.join(' ');
    console.log('Generating daily report...\n');
    const result = await generate('daily', userInput);
    console.log(result);
  });

program
  .command('weekly')
  .description('Generate a weekly KPT report')
  .argument('<input...>', 'Bullet points of the week')
  .action(async (inputParts: string[]) => {
    const userInput = inputParts.join(' ');
    console.log('Generating weekly KPT...\n');
    const result = await generate('weekly', userInput);
    console.log(result);
  });

program.parse();
