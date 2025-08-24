// src/ai/flows/connection-assistance.ts
'use server';

/**
 * @fileOverview A connection assistance AI agent that optimizes transfer protocols.
 *
 * - getConnectionAssistance - A function that suggests transfer protocol adjustments.
 * - ConnectionAssistanceInput - The input type for the getConnectionAssistance function.
 * - ConnectionAssistanceOutput - The return type for the getConnectionAssistance function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ConnectionAssistanceInputSchema = z.object({
  networkConditions: z
    .string()
    .describe(
      'A description of the current network conditions, including signal strength, latency, and any known issues.'
    ),
  transferStatus: z
    .string()
    .describe(
      'Information about the current file transfer status, such as speed, errors, and interruptions.'
    ),
});
export type ConnectionAssistanceInput = z.infer<typeof ConnectionAssistanceInputSchema>;

const ConnectionAssistanceOutputSchema = z.object({
  suggestedAdjustments: z
    .string()
    .describe(
      'A list of suggested adjustments to the transfer protocol to improve stability and speed, such as changing chunk size, enabling compression, or switching to a different protocol.'
    ),
  likelyCause: z
    .string()
    .describe('The most likely cause of the connection issues.'),
});
export type ConnectionAssistanceOutput = z.infer<typeof ConnectionAssistanceOutputSchema>;

export async function getConnectionAssistance(
  input: ConnectionAssistanceInput
): Promise<ConnectionAssistanceOutput> {
  return connectionAssistanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'connectionAssistancePrompt',
  input: {schema: ConnectionAssistanceInputSchema},
  output: {schema: ConnectionAssistanceOutputSchema},
  prompt: `You are an AI assistant that helps optimize file transfer protocols over unstable networks.

You are provided with information about the current network conditions and the file transfer status.
Based on this information, you will suggest adjustments to the transfer protocol to improve stability and speed.

Network Conditions: {{{networkConditions}}}
Transfer Status: {{{transferStatus}}}

Consider the following:
- If the signal strength is low, suggest reducing the chunk size to decrease the amount of data lost during interruptions.
- If latency is high, suggest enabling compression to reduce the amount of data being transferred.
- If there are frequent interruptions, suggest switching to a more reliable protocol, such as TCP.
- Suggest checking firewall settings if there are connectivity issues.
- Provide general tips for improving network stability.

Output the suggested adjustments in a clear, concise manner. Also, state the most likely cause.
`,
});

const connectionAssistanceFlow = ai.defineFlow(
  {
    name: 'connectionAssistanceFlow',
    inputSchema: ConnectionAssistanceInputSchema,
    outputSchema: ConnectionAssistanceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

