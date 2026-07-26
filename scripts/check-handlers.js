#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const issues = [];

// Built-in globals that may appear in handlers
const builtins = new Set([
  'alert', 'confirm', 'console', 'window', 'document', 'event', 'this',
  'return', 'true', 'false', 'null', 'undefined', 'Math', 'Object',
  'Array', 'String', 'Number', 'Date', 'Function', 'Boolean', 'Error',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURIComponent',
  'encodeURIComponent', 'fetch', 'JSON', 'RegExp', 'Promise'
]);

function extractFunctionCalls(handlerValue) {
  // Extract identifiers that appear before an opening parenthesis
  // Handles cases like: functionName(), obj.fn(), but we only care about the first identifier
  const calls = new Set();
  // Match: word characters followed by (
  // This regex captures the function name before the opening paren
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = regex.exec(handlerValue)) !== null) {
    calls.add(match[1]);
  }
  return calls;
}

function extractFunctionDefinitions(scriptContent) {
  const defined = new Set();

  // Match: function name(
  const funcDecl = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = funcDecl.exec(scriptContent)) !== null) {
    defined.add(match[1]);
  }

  // Match: const/let/var name = function or const/let/var name = (
  const varDecl = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|\()/g;
  while ((match = varDecl.exec(scriptContent)) !== null) {
    defined.add(match[1]);
  }

  // Match: const/let/var name = async function or const/let/var name = async (
  const asyncDecl = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s*(?:function|\()/g;
  while ((match = asyncDecl.exec(scriptContent)) !== null) {
    defined.add(match[1]);
  }

  return defined;
}

function extractExternalScriptFunctions(filePath, scriptSrc) {
  // Resolve relative path
  const scriptPath = path.resolve(path.dirname(filePath), scriptSrc);

  if (!fs.existsSync(scriptPath)) {
    return new Set();
  }

  try {
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    const defined = new Set();

    // Get function definitions
    const funcDefs = extractFunctionDefinitions(scriptContent);
    funcDefs.forEach(f => defined.add(f));

    // Names exported from a UMD module. These modules end with a
    // `return { ... }` object (see retirement-engine.js), but they also
    // contain many earlier `return {` statements inside ordinary functions,
    // and an exports object spans nested braces. Rather than trying to find
    // the right block, treat every object-literal key in the module as a
    // possible export: a mistyped handler name will not appear as a key
    // anywhere, so this stays useful while producing no false positives.
    let match;
    const propRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
    while ((match = propRegex.exec(scriptContent)) !== null) {
      defined.add(match[1]);
    }

    // Shorthand properties in a returned object: `return { foo, bar }`.
    const shorthandRegex = /\breturn\s*\{([\s\S]*?)\}/g;
    while ((match = shorthandRegex.exec(scriptContent)) !== null) {
      const names = match[1].match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
      names.forEach(name => defined.add(name));
    }

    // Also look for patterns like Module.name = function or SomeGlobal.fn = ...
    const globalAssign = /\b(?:\w+)\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|async\s*function|\()/g;
    while ((match = globalAssign.exec(scriptContent)) !== null) {
      defined.add(match[1]);
    }

    return defined;
  } catch (e) {
    // If we can't read the file, silently ignore
    return new Set();
  }
}

for (const file of htmlFiles) {
  const filePath = path.join(root, file);
  const html = fs.readFileSync(filePath, 'utf8');

  // Extract all inline handlers
  const handlers = new Map(); // handlerName -> Set of function calls
  const handlerRegex = /\bon([a-z]+)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = handlerRegex.exec(html)) !== null) {
    const handlerName = match[1];
    const handlerValue = match[2];
    const calls = extractFunctionCalls(handlerValue);
    for (const call of calls) {
      if (!handlers.has(call)) {
        handlers.set(call, []);
      }
      handlers.get(call).push(`${handlerName}="${handlerValue.substring(0, 50)}${handlerValue.length > 50 ? '...' : ''}"`);
    }
  }

  if (handlers.size === 0) {
    continue;
  }

  // Extract function definitions from inline scripts
  const defined = new Set();
  const scriptRegex = /<script(?:\s[^>]*)?>([^]*?)<\/script>/gi;
  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptContent = match[1];
    // Skip external script tags
    if (html.substring(match.index, match.index + 20).includes('src=')) {
      continue;
    }
    const funcs = extractFunctionDefinitions(scriptContent);
    funcs.forEach(f => defined.add(f));
  }

  // Extract external script references
  const externalScriptRegex = /<script\s+src\s*=\s*["']([^"']+)["']\s*>/gi;
  while ((match = externalScriptRegex.exec(html)) !== null) {
    const scriptSrc = match[1];
    // Skip CDN and absolute URLs
    if (/^(?:https?:|\/\/)/.test(scriptSrc)) {
      continue;
    }
    const externalFuncs = extractExternalScriptFunctions(filePath, scriptSrc);
    externalFuncs.forEach(f => defined.add(f));
  }

  // Check if all handlers are defined
  for (const [funcName, callSites] of handlers) {
    if (!defined.has(funcName) && !builtins.has(funcName)) {
      issues.push(`${file}: handler calls undefined function "${funcName}" in ${callSites[0]}`);
    }
  }
}

if (issues.length) {
  console.error('Undefined event handlers:');
  issues.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML file${htmlFiles.length === 1 ? '' : 's'}: all event handlers resolve`);
