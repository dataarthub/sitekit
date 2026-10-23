// This is a data-profile validator, not a JSON Schema evaluator or authorizer.
function invalid(): never { throw new Error('Invalid portable template schema'); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const schemaTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const textKeys = new Set(['title', 'description', 'pattern', '$ref']);
const integerKeys = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties']);
const numberKeys = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']);
const mapKeys = new Set(['properties', '$defs']);
const branchKeys = new Set(['oneOf', 'anyOf', 'allOf']);
const childKeys = new Set(['items', 'additionalProperties', 'propertyNames']);
const uiKeys = new Set(['label', 'group', 'width', 'placeholder', 'widget']);
const widgets = new Set(['textarea', 'text', 'select', 'checkbox', 'number', 'date', 'image', 'media']);
const pointer = (path: string, key: string) => path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');

/** Internal bounded traversal before JSON serialization or Zod parsing. */
export function assertPortableJson(value: unknown): void {
  const stack = new Set<object>(); let count = 0;
  function visit(item: unknown, depth: number): void {
    if (depth > 32 || ++count > 100000) invalid();
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > 256 * 1024) invalid(); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); return; }
    if (!item || typeof item !== 'object' || stack.has(item)) invalid();
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) invalid();
    stack.add(item);
    const names = Object.getOwnPropertyNames(item);
    if (Object.getOwnPropertySymbols(item).length) invalid();
    if (Array.isArray(item) && (item.length > 100000 || names.length !== item.length + 1)) invalid();
    for (const name of names) {
      if (Array.isArray(item) && name === 'length') continue;
      if (['__proto__', 'constructor', 'prototype'].includes(name)) invalid();
      if (Array.isArray(item) && !/^(0|[1-9]\d*)$/.test(name)) invalid();
      const descriptor = Object.getOwnPropertyDescriptor(item, name)!;
      if (!descriptor.enumerable || !('value' in descriptor)) invalid();
      visit(descriptor.value, depth + 1);
    }
    stack.delete(item);
  }
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) invalid();
}

/** Validates only an explicit schema vocabulary and resolvable, acyclic schema references. */
export function assertSchemaProfile(root: Record<string, unknown>): void {
  const nodes = new Map<string, { edges: string[]; ref?: string }>();
  function visit(schema: unknown, path: string): void {
    if (!object(schema)) invalid();
    const node: { edges: string[]; ref?: string } = { edges: [] }; nodes.set(path, node);
    const child = (value: unknown, childPath: string) => { node.edges.push(childPath); visit(value, childPath); };
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'type') {
        const types = Array.isArray(value) ? value : [value];
        if (!types.length || new Set(types).size !== types.length || types.some(type => typeof type !== 'string' || !schemaTypes.has(type))) invalid();
      } else if (textKeys.has(key)) {
        if (typeof value !== 'string') invalid();
        if (key === '$ref') { if (value !== '#' && (!value.startsWith('#/') || /~(?![01])/.test(value))) invalid(); node.ref = value; }
        if (key === 'pattern') { try { new RegExp(value); } catch { invalid(); } }
      } else if (key === 'format') {
        if (!['date', 'date-time', 'uri', 'email', 'uuid'].includes(String(value))) invalid();
      } else if (integerKeys.has(key)) {
        if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
      } else if (numberKeys.has(key)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || (key === 'multipleOf' && value <= 0)) invalid();
      } else if (mapKeys.has(key)) {
        if (!object(value)) invalid();
        for (const [name, nested] of Object.entries(value)) child(nested, pointer(pointer(path, key), name));
      } else if (branchKeys.has(key)) {
        if (!Array.isArray(value) || !value.length) invalid();
        value.forEach((nested, index) => child(nested, pointer(pointer(path, key), String(index))));
      } else if (childKeys.has(key)) {
        if (key === 'additionalProperties' && typeof value === 'boolean') continue;
        child(value, pointer(path, key));
      } else if (key === 'required') {
        if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(name => typeof name !== 'string')) invalid();
      } else if (key === 'enum') {
        if (!Array.isArray(value) || !value.length) invalid();
      } else if (key === 'const' || key === 'default') {
        // Payload values were validated by assertPortableJson, never traversed as schemas.
      } else if (key === 'uniqueItems' || key === 'x-date') {
        if (typeof value !== 'boolean') invalid();
      } else if (key === 'x-ui') {
        if (!object(value) || Object.entries(value).some(([name, item]) => !uiKeys.has(name) || typeof item !== 'string' || (name === 'widget' && !widgets.has(item)))) invalid();
      } else invalid();
    }
    for (const [minimum, maximum] of [['minLength', 'maxLength'], ['minItems', 'maxItems'], ['minProperties', 'maxProperties'], ['minimum', 'maximum']]) {
      const low = schema[minimum!], high = schema[maximum!];
      if (typeof low === 'number' && typeof high === 'number' && low > high) invalid();
    }
  }
  visit(root, '#');
  const visiting = new Set<string>(), done = new Set<string>();
  function resolve(path: string): void {
    if (done.has(path)) return;
    const node = nodes.get(path); if (!node || visiting.has(path)) invalid();
    visiting.add(path);
    for (const next of [...node.edges, ...(node.ref ? [node.ref] : [])]) resolve(next);
    visiting.delete(path); done.add(path);
  }
  for (const path of nodes.keys()) resolve(path);
}
