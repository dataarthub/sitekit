export type {
  Citation,
  AiContextDocument,
  AiContextOptions,
  EntityReference,
  MachineReadableContent,
  MachineReadableContentAdapter,
} from './representation.js';
export { buildMachineReadableContent } from './representation.js';
export { buildAiContext } from './representation.js';
export {
  createAiPromptRegistry,
  type AiPromptDefinition,
  type AiPromptRegistry,
} from './prompts.js';
