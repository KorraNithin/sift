import { z } from 'zod';
import { canonicalSkill } from './taxonomy.js';

const llmSchema = z.object({
  title: z.string().min(2).max(120),
  experienceMin: z.number().min(0).max(40),
  experienceMax: z.number().min(0).max(50),
  noticeMaxDays: z.number().int().min(0).max(180).nullable(),
  location: z.string().max(60).nullable(),
  ctcMaxLpa: z.number().min(0).max(500).nullable(),
  mustHave: z.array(z.string().min(1).max(60)).max(15),
  niceToHave: z.array(z.string().min(1).max(60)).max(10),
});

const SYSTEM = `You extract hiring requirements from a job description. Reply with JSON only, no prose, with keys:
title, experienceMin, experienceMax, noticeMaxDays (null if absent), location (null if absent), ctcMaxLpa (null if absent),
mustHave (array of skill names), niceToHave (array of skill names). Never include candidate demographics.`;

/**
 * Optional LLM extraction of a scorecard draft. Off unless ANTHROPIC_API_KEY is set.
 * Output is schema-validated; any failure returns null so callers fall back to the rule-based extractor.
 */
export async function extractWithLlm(jdText, config) {
  if (!config.anthropicKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: 'user', content: String(jdText).slice(0, 8000) }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const parsed = llmSchema.parse(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    const skills = [
      ...parsed.mustHave.map((name) => ({ name: canonicalSkill(name), required: true, weight: 2 })),
      ...parsed.niceToHave.map((name) => ({ name: canonicalSkill(name), required: false, weight: 1 })),
    ];
    return {
      source: 'llm',
      notes: [],
      scorecard: {
        title: parsed.title,
        experience: { min: parsed.experienceMin, max: Math.max(parsed.experienceMin, parsed.experienceMax) },
        skills,
        noticeMax: parsed.noticeMaxDays,
        location: parsed.location,
        ctcMax: parsed.ctcMaxLpa,
      },
    };
  } catch {
    return null;
  }
}
