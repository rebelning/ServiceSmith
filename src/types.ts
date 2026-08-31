export type CategoryId =
  | 'entry'
  | 'service'
  | 'data'
  | 'message'
  | 'governance'
  | 'observability';

export type ConfigField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
};

export type Requirement = {
  types: string[];
  mode: 'any' | 'all';
  minCount?: number;
  description: string;
};

export type NodeDefinition = {
  type: string;
  name: string;
  subtitle: string;
  category: CategoryId;
  icon: string;
  color: string;
  description: string;
  usage: string[];
  principles: string[];
  pitfalls: string[];
  docs?: string;
  tags: string[];
  requirements?: Requirement[];
  maxInstances?: number;
  configFields: ConfigField[];
  defaults: Record<string, string | number | boolean>;
};

export type CanvasNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  protocol: string;
  mode?: 'SYNC' | 'ASYNC' | 'STREAM';
  timeout?: number;
  retries?: number;
  description?: string;
};

export type ValidationResult = {
  allowed: boolean;
  reasons: string[];
  suggestions: string[];
};
