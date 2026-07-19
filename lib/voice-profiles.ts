import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { uiOutput } from "./ui-evidence";

export type VoiceProfile = {
  id: string;
  transcript: string;
  audioPath: string;
  createdAt: string;
};

export const voiceProfileDirectory = path.join(uiOutput, "references");
const idPattern = /^[a-f0-9-]{36}$/i;

export function ensureVoiceProfileDirectory() {
  mkdirSync(voiceProfileDirectory, { recursive: true });
}

export function voiceProfilePaths(id: string) {
  if (!idPattern.test(id)) throw new Error("Invalid voice profile ID.");
  ensureVoiceProfileDirectory();
  return {
    audio: path.join(voiceProfileDirectory, `${id}.wav`),
    metadata: path.join(voiceProfileDirectory, `${id}.json`),
    source: path.join(voiceProfileDirectory, `${id}.webm`),
  };
}

export function readVoiceProfile(id: string): VoiceProfile {
  const paths = voiceProfilePaths(id);
  if (!existsSync(paths.metadata) || !existsSync(paths.audio)) {
    throw new Error("Voice profile was not found.");
  }
  const profile = JSON.parse(readFileSync(paths.metadata, "utf8")) as VoiceProfile;
  if (profile.id !== id || !profile.transcript?.trim()) throw new Error("Voice profile is invalid.");
  return { ...profile, id, audioPath: paths.audio };
}
