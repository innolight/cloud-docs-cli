import type { DocProvider } from './types.ts';
import { awsProvider } from './aws/aws.ts';
import { azureProvider } from './azure/azure.ts';

export const providers: DocProvider[] = [awsProvider, azureProvider];

export function pickProvider(url: URL): DocProvider {
  const p = providers.find((x) => x.matches(url));
  if (!p) throw new Error(`No provider registered for ${url.hostname}`);
  return p;
}
