import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

export const root = process.cwd();
export const uiOutput = path.join(root, "outputs", "ui");
const runsPath = path.join(uiOutput, "runs.jsonl");
const evaluationsPath = path.join(uiOutput, "evaluations.jsonl");
const ratingsPath = path.join(uiOutput, "ratings.jsonl");

export type UiRun = {
  runId: string; createdAt: string; model: "chatterbox-turbo"; language: "en"; category: string; text: string;
  audioFile?: string; status: "ok" | "error"; error?: string; audioSeconds?: number; generationSeconds?: number;
  fullClipLatencySeconds?: number; rtf?: number; peakVramMb?: number | null; ttfaMode: "not_measured_batch_api";
  startupSeconds?: number; referenceAudio: string;
};
export type UiEvaluation = { runId: string; createdAt: string; status: "ok" | "error"; asrText?: string; wer?: number; speakerCosine?: number; error?: string };
export type UiRating = { runId: string; createdAt: string; listenerId: string; naturalness: number; speakerJudgment: "same" | "unsure" | "different"; comment?: string };

function rows<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as T]; } catch { return []; } });
}
function append(file: string, row: object) { mkdirSync(uiOutput, { recursive: true }); appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8"); }
const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const values = (items: Array<number | null | undefined>) => items.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
const mean = (items: number[]) => items.length ? round(items.reduce((sum, item) => sum + item, 0) / items.length) : null;
const median = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return sorted.length ? round(sorted[Math.floor(sorted.length / 2)]) : null; };
const p95 = (items: number[]) => { const sorted = [...items].sort((a, b) => a - b); return sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)]) : null; };

export function readRuns() { return rows<UiRun>(runsPath); }
export function appendRun(run: UiRun) { append(runsPath, run); }
export function readEvaluations() { return rows<UiEvaluation>(evaluationsPath); }
export function appendEvaluation(evaluation: UiEvaluation) { append(evaluationsPath, evaluation); }
export function readRatings() { return rows<UiRating>(ratingsPath); }
export function appendRating(rating: UiRating) { append(ratingsPath, rating); }

export function metricsFor(runId?: string) {
  const runs = readRuns();
  const evaluations = readEvaluations();
  const ratings = readRatings();
  const latestEvaluation = new Map<string, UiEvaluation>();
  for (const evaluation of evaluations) latestEvaluation.set(evaluation.runId, evaluation);
  const relevantRuns = runId ? runs.filter(run => run.runId === runId) : runs;
  const success = relevantRuns.filter(run => run.status === "ok");
  const selected = runId ? runs.findLast(run => run.runId === runId) : runs.at(-1);
  const selectedEvaluation = selected ? latestEvaluation.get(selected.runId) : undefined;
  const selectedRatings = selected ? ratings.filter(rating => rating.runId === selected.runId) : [];
  const same = selectedRatings.filter(rating => rating.speakerJudgment === "same").length;
  const listeners = new Set(selectedRatings.map(rating => rating.listenerId));
  const relevantIds = new Set(relevantRuns.map(run => run.runId));
  const objective = [...latestEvaluation.values()].filter(item => item.status === "ok" && (!runId || relevantIds.has(item.runId)));
  const timing = values(success.map(run => run.fullClipLatencySeconds));
  const rtf = values(success.map(run => run.rtf));
  const vram = values(success.map(run => run.peakVramMb));
  return {
    scope: { model: "chatterbox-turbo", language: "en", mode: "batch", unsupportedLanguages: ["ar", "hi"] },
    latest: selected ? { ...selected, evaluation: selectedEvaluation ?? null, ratings: { naturalnessMos: mean(selectedRatings.map(rating => rating.naturalness)), ratingsCount: selectedRatings.length, listenerCount: listeners.size, sameSpeakerVotes: same, sameSpeakerRate: selectedRatings.length ? round(same / selectedRatings.length) : null } } : null,
    summary: {
      attemptedRuns: relevantRuns.length, successfulRuns: success.length, failureRate: relevantRuns.length ? round((relevantRuns.length - success.length) / relevantRuns.length) : null,
      medianFullClipSeconds: median(timing), p95FullClipSeconds: p95(timing), medianRtf: median(rtf), p95Rtf: p95(rtf), maxPeakVramMb: vram.length ? Math.max(...vram) : null,
      meanWer: mean(values(objective.map(item => item.wer))), meanSpeakerCosine: mean(values(objective.map(item => item.speakerCosine))), evaluatedRuns: objective.length,
    },
    history: runs.slice(-12).reverse().map(run => ({ ...run, evaluation: latestEvaluation.get(run.runId) ?? null })),
  };
}
