import config from "../configs/tts-pipelines.json";

export type Language = "en" | "hi" | "ar";
export type WorkerKind = "turbo" | "multilingual" | "indicf5";
export type PipelineModel = {
  label: string;
  worker: WorkerKind;
  environment: string;
  runModel: "chatterbox-turbo" | "chatterbox-multilingual" | "indicf5";
};
export type LanguagePipeline = {
  default: string;
  fallback?: string;
  models: Record<string, PipelineModel>;
};

export const ttsPipelines = config as Record<Language, LanguagePipeline>;

export function pipelineFor(language: Language): LanguagePipeline {
  return ttsPipelines[language];
}

export function modelFor(
  language: Language,
  requested?: string,
): [string, PipelineModel] {
  const pipeline = pipelineFor(language);
  const id =
    requested && pipeline.models[requested] ? requested : pipeline.default;
  return [id, pipeline.models[id]];
}
