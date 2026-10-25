import type { Evaluation, Meta } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("The January snapshot is not available.");
    }
    throw new Error("The evaluation could not be loaded.");
  }
  return response.json() as Promise<T>;
}

export function getMeta(): Promise<Meta> {
  return getJson<Meta>("/api/v1/meta");
}

export function getEvaluation(cutoff: string, strategy: string): Promise<Evaluation> {
  const query = new URLSearchParams({ cutoff, strategy });
  return getJson<Evaluation>(`/api/v1/evaluation?${query.toString()}`);
}
