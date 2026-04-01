/**
 * Calculator tool — evaluates simple arithmetic expressions.
 * Uses a safe evaluator (no eval) to prevent code injection.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Safely evaluates basic arithmetic expressions.
 * Supports: +, -, *, /, (, ), and decimal numbers.
 * Rejects any expression containing non-numeric / non-operator characters.
 */
function safeEval(expression: string): number {
  // Whitelist: digits, decimal point, operators, parentheses, whitespace
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    throw new Error('Invalid characters in expression');
  }

  // Use Function constructor in a controlled, sandboxed manner — expression is
  // already whitelisted to arithmetic characters only.
  // eslint-disable-next-line no-new-func
  const result = new Function(`"use strict"; return (${expression})`)() as unknown;
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number');
  }
  return result;
}

export const calculatorTool = new DynamicStructuredTool({
  name: 'calculator',
  description:
    'Evaluates arithmetic expressions. Use this for any math calculation. ' +
    'Input must be a valid arithmetic expression (e.g. "15 * 4 + 7").',
  schema: z.object({
    expression: z.string().describe('Arithmetic expression to evaluate, e.g. "15 * 4 + 7"'),
  }),
  func: async ({ expression }: { expression: string }) => {
    try {
      const result = safeEval(expression);
      return `${expression} = ${result}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error evaluating expression: ${message}`;
    }
  },
});
