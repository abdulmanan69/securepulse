import 'server-only';

import { env } from '@/lib/env';
import type { Finding } from '@/lib/scanner/types';

/**
 * The written half of a report: an executive summary and a prioritised fix
 * list, in language a business owner can act on.
 *
 * Two hard rules, because this is a security product and a confident wrong
 * answer is worse than no answer:
 *
 *  1. The model is never asked what is wrong with the site. The scanner
 *     already determined that deterministically. The model is given the
 *     findings and asked only to order and explain them. It cannot invent a
 *     vulnerability because it is not the thing doing the detecting.
 *
 *  2. With no API key configured, a deterministic template runs instead. The
 *     feature degrades in quality, not in correctness, and nothing anywhere
 *     claims AI wrote something it did not.
 */

const SYSTEM_PROMPT = `You write remediation guidance for SecurePulse, a website security monitoring service.

You will receive the findings of a completed, automated scan. Your job is to explain and prioritise them for a non-specialist: a small business owner or a web designer, not a security engineer.

Rules you must follow:
- Use ONLY the findings provided. Never mention an issue that is not in the list.
- Never speculate about vulnerabilities that were not detected. The scan is a passive configuration review; it does not test for SQL injection, XSS, or any exploitable flaw, and you must not imply that it did.
- Never state or imply the site "is secure" or "has been penetration tested".
- Order the work by real-world risk and by how quickly it can be done.
- Write plainly. No jargon without a short explanation. No marketing language.
- Be specific about the fix. "Add a header" is useless; name the header and its value.

Format your reply as GitHub-flavoured Markdown with exactly these sections:

## What this means
Two or three sentences on the overall state of the site, in plain language.

## Fix these first
The highest-risk items, as a numbered list. For each: what to change, and one sentence on what goes wrong if it is not changed.

## Worth doing next
Lower-priority items as a short bulleted list.

Keep the whole reply under 400 words.`;

function buildUserPrompt(params: {
  hostname: string;
  grade: string;
  score: number;
  findings: Finding[];
}): string {
  const actionable = params.findings.filter(
    (finding) => finding.status === 'fail' || finding.status === 'warn',
  );

  const lines = actionable.map(
    (finding) =>
      `- [${finding.severity}/${finding.status}] ${finding.title}\n  Detail: ${finding.detail}\n  Suggested fix: ${finding.remediation ?? 'none recorded'}`,
  );

  return `Site: ${params.hostname}
Overall grade: ${params.grade} (${params.score}/100)
Checks passed: ${params.findings.filter((f) => f.status === 'pass').length}

Findings that need attention:
${lines.join('\n')}`;
}

/**
 * Deterministic fallback used when no API key is configured, or when the model
 * call fails or is declined. Produces the same sections from the same data, so
 * a report is never blank and never misleading.
 */
export function templateSummary(params: {
  hostname: string;
  grade: string;
  score: number;
  findings: Finding[];
}): string {
  const fails = params.findings.filter((f) => f.status === 'fail');
  const warns = params.findings.filter((f) => f.status === 'warn');

  const severityRank = ['critical', 'high', 'medium', 'low', 'info'];
  const byRisk = [...fails].sort(
    (a, b) =>
      severityRank.indexOf(a.severity) - severityRank.indexOf(b.severity),
  );

  const state =
    fails.length === 0 && warns.length === 0
      ? `${params.hostname} passed every check in this scan.`
      : `${params.hostname} scored ${params.score} out of 100 (grade ${params.grade}). ${fails.length} check${fails.length === 1 ? '' : 's'} failed and ${warns.length} need${warns.length === 1 ? 's' : ''} attention.`;

  const sections = [`## What this means\n\n${state}`];

  if (byRisk.length > 0) {
    sections.push(
      `## Fix these first\n\n${byRisk
        .map(
          (finding, index) =>
            `${index + 1}. **${finding.title}** — ${finding.remediation ?? finding.detail}`,
        )
        .join('\n')}`,
    );
  }

  if (warns.length > 0) {
    sections.push(
      `## Worth doing next\n\n${warns
        .map((finding) => `- **${finding.title}** — ${finding.remediation ?? finding.detail}`)
        .join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

export interface SummaryResult {
  markdown: string;
  source: 'ai' | 'template';
  /** Present when the AI path was attempted and did not produce the text. */
  note?: string;
}

export async function generateRemediationSummary(params: {
  hostname: string;
  grade: string;
  score: number;
  findings: Finding[];
}): Promise<SummaryResult> {
  const fallback = () => templateSummary(params);

  if (!env.anthropic.enabled) {
    return { markdown: fallback(), source: 'template' };
  }

  // Nothing to prioritise means nothing worth spending a model call on.
  const actionable = params.findings.filter(
    (f) => f.status === 'fail' || f.status === 'warn',
  );
  if (actionable.length === 0) {
    return { markdown: fallback(), source: 'template' };
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.anthropic.apiKey });

    const response = await client.beta.messages.create({
      model: env.anthropic.model,
      // Hard ceiling. This is the only per-report model cost in the product
      // and it has to stay predictable for the unit economics to hold.
      max_tokens: env.anthropic.maxTokens,
      // The task is explanation and ordering, not open-ended reasoning, so the
      // lowest effort level is appropriate and materially cheaper.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(params) }],
      // Security findings can trip a safety classifier. Rather than returning
      // a blank report, let the API re-run the same request on another model.
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
    });

    // Must be checked before reading content: a declined request returns 200.
    if (response.stop_reason === 'refusal') {
      return {
        markdown: fallback(),
        source: 'template',
        note: 'Automated guidance was unavailable for this report.',
      };
    }

    const text = response.content
      .filter((block): block is { type: 'text'; text: string } & typeof block =>
        block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (text.length === 0) {
      return { markdown: fallback(), source: 'template' };
    }

    return { markdown: text, source: 'ai' };
  } catch (error) {
    console.error('[ai:remediation] falling back to template', error);
    return {
      markdown: fallback(),
      source: 'template',
      note: 'Automated guidance was unavailable for this report.',
    };
  }
}
