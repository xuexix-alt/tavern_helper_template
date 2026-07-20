/* eslint-disable */
// @ts-nocheck
import _ from 'lodash';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import z from 'zod';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && path.extname(specifier) === '') {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

function normalizeSchemaPath(value) {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '');
}

function selectSchemaFiles(files, configuredPrefixes) {
  if (configuredPrefixes === undefined) return files;

  const prefixes = configuredPrefixes.split(';').map(normalizeSchemaPath).filter(Boolean);
  if (prefixes.length === 0) {
    throw new Error('TAVERN_SCHEMA_PREFIXES is set but contains no valid path prefixes');
  }

  return files.filter(file => {
    const normalizedFile = normalizeSchemaPath(file);
    return prefixes.some(prefix => normalizedFile === prefix || normalizedFile.startsWith(prefix + '/'));
  });
}

const schemaFiles = selectSchemaFiles(fs.globSync('src/**/schema.ts'), process.env.TAVERN_SCHEMA_PREFIXES);

for (const schema_file of schemaFiles) {
  try {
    globalThis._ = _;
    globalThis.z = z;

    const module = await import(pathToFileURL(path.resolve(import.meta.dirname, schema_file)).href);
    if (_.has(module, 'Schema')) {
      let schema = _.get(module, 'Schema');
      if (_.isFunction(schema)) {
        schema = schema();
      }
      fs.writeFileSync(
        path.join(path.dirname(schema_file), 'schema.json'),
        `${JSON.stringify(z.toJSONSchema(schema, { io: 'input', reused: 'ref' }), null, 2)}\n`,
      );
    }
  } catch (e) {
    console.error(`生成 '${schema_file}' 对应的 schema.json 失败: ${e}`);
    process.exitCode = 1;
  }
}
