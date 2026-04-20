import type { DocProvider } from "./types.ts";
import { awsProvider } from "./aws.ts";

export const providers: DocProvider[] = [awsProvider];

export function pickProvider(url: URL): DocProvider {
  const p = providers.find((x) => x.matches(url));
  if (!p) throw new Error(`No provider registered for ${url.hostname}`);
  return p;
}
