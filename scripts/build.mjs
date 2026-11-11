import fs from 'node:fs';
import path from 'node:path';

import { Linter } from 'eslint';

import knownIssues from '../src/collections/known-issues/index.js';
import regression from '../src/collections/regression/index.js';
import cleanup from '../src/collections/shared/cleanup.js';
import validation from '../src/collections/validation/index.js';
import createLib from '../src/lib/lib.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, 'postman');
const SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const loadSchemas = () =>
  Object.fromEntries(
    fs
      .readdirSync(path.join(ROOT, 'src/schemas'))
      .filter(file => file.endsWith('.json'))
      .sort()
      .map(file => [
        path.basename(file, '.json'),
        JSON.parse(fs.readFileSync(path.join(ROOT, 'src/schemas', file), 'utf8')),
      ]),
  );

const dedent = text => {
  const lines = text.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^\s*/)[0].length));
  return lines.map(line => line.slice(indent));
};

const closingParen = (source, open) => {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '(') depth++;
    if (source[index] === ')' && --depth === 0) return index;
  }
  throw new Error(`Unbalanced parentheses in ${source.slice(0, 60)}`);
};

const scriptFrom = fn => {
  const source = fn.toString();
  const open = source.indexOf('(');
  const close = closingParen(source, open);
  const params = source.slice(open + 1, close).trim();
  const body = source.slice(source.indexOf('{', close) + 1, source.lastIndexOf('}'));
  const setup = params ? `const ${params} = lib(pm);` : 'lib(pm);';
  return ['{', `  ${setup}`, ...dedent(body).map(line => (line ? `  ${line}` : line)), '}'];
};

const linter = new Linter({ configType: 'flat' });
const SANDBOX_GLOBALS = { pm: 'readonly', lib: 'writable', schemas: 'writable', require: 'readonly' };

const assertValidScript = (exec, where) => {
  const messages = linter.verify(exec.join('\n'), [
    {
      languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: SANDBOX_GLOBALS },
      rules: { 'no-undef': 'error' },
    },
  ]);
  if (messages.length > 0) {
    const details = messages.map(message => `  line ${message.line}: ${message.message}`).join('\n');
    throw new Error(`Invalid script in "${where}":\n${details}`);
  }
};

const event = (listen, exec, where) => {
  assertValidScript(exec, `${where} (${listen})`);
  return { listen, script: { type: 'text/javascript', exec } };
};

const toItem = definition => {
  const header = [{ key: 'Content-Type', value: 'application/json' }];
  if (definition.auth) header.push({ key: 'Authorization', value: definition.auth });
  const request = { method: definition.method, header, url: `{{baseUrl}}${definition.path}` };
  if (definition.body) request.body = { mode: 'raw', raw: definition.body, options: { raw: { language: 'json' } } };

  const events = [];
  if (definition.prerequest) events.push(event('prerequest', scriptFrom(definition.prerequest), definition.name));
  events.push(event('test', definition.test ? scriptFrom(definition.test) : ['lib(pm);'], definition.name));
  return { name: definition.name, event: events, request, response: [] };
};

const toCollection = (definition, schemas) => ({
  info: { name: definition.name, description: definition.description, schema: SCHEMA_URL },
  variable: [{ key: 'runId', value: '' }],
  event: [
    event('prerequest', [`schemas = ${JSON.stringify(schemas)};`, `lib = ${createLib.toString()};`], definition.name),
  ],
  item: [...definition.folders, cleanup].map(folder => ({
    name: folder.name,
    description: folder.description,
    item: folder.items.map(toItem),
  })),
});

const schemas = loadSchemas();
fs.mkdirSync(OUTPUT, { recursive: true });
for (const [file, definition] of [
  ['regression', regression],
  ['validation', validation],
  ['known-issues', knownIssues],
]) {
  const collection = toCollection(definition, schemas);
  const target = path.join(OUTPUT, `${file}.postman_collection.json`);
  fs.writeFileSync(target, `${JSON.stringify(collection, null, 2)}\n`);
  const requests = collection.item.reduce((total, folder) => total + folder.item.length, 0);
  console.log(`built ${path.relative(ROOT, target)} (${requests} requests)`);
}
