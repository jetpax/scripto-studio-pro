/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * ScriptO Config Parser and Code Generator
 * Parses Python dict config blocks from ScriptOs files
 * Ported from Scripto Studio's libs/scriptos-parser.js
 */

interface ScriptOConfig {
	info?: {
		name?: string;
		description?: string;
		author?: string;
		version?: string | number[];
		category?: string;
		www?: string;
	};
	args?: {
		[key: string]: {
			type: 'str' | 'int' | 'float' | 'bool' | 'list' | 'dict';
			label?: string;
			value?: any;
			optional?: boolean;
			items?: { [key: string]: string };
		};
	};
	silent?: boolean;
}

/**
 * Parse a ScriptO configuration block from Python code
 * @param pythonCode - The full Python file content
 * @returns Parsed config object or null if invalid
 */
export function parseScriptOsConfig(pythonCode: string): ScriptOConfig | null {
	const startMarker = '# === START_CONFIG_PARAMETERS ===';
	const endMarker = '# === END_CONFIG_PARAMETERS ===';

	const startIdx = pythonCode.indexOf(startMarker);
	const endIdx = pythonCode.indexOf(endMarker);

	if (startIdx === -1 || endIdx === -1) {
		console.warn('[ScriptOs Parser] Config markers not found');
		return null;
	}

	// Extract the dict(...) block
	const configBlock = pythonCode.substring(startIdx + startMarker.length, endIdx).trim();

	try {
		// Convert Python dict to JavaScript object
		const config = parsePythonDict(configBlock);
		return config as ScriptOConfig;
	} catch (e) {
		console.error('[ScriptOs Parser] Failed to parse config:', e);
		return null;
	}
}

/**
 * Parse Python dict syntax to JavaScript object
 * @param pythonDict - Python dict string
 * @returns Parsed object
 */
function parsePythonDict(pythonDict: string): any {
	// Remove outer dict(...) wrapper
	let content = pythonDict.trim();
	if (content.startsWith('dict(') && content.endsWith(')')) {
		content = content.substring(5, content.length - 1).trim();
	}

	// Remove Python comments (but preserve # inside strings)
	content = content.split('\n').map(line => {
		// Find # that's not inside a string
		let inString = false;
		let stringChar: string | null = null;
		let escaped = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === '\\') {
				escaped = true;
				continue;
			}

			if ((char === '"' || char === "'" || char === '`') && !inString) {
				inString = true;
				stringChar = char;
				continue;
			}

			if (char === stringChar && inString) {
				inString = false;
				stringChar = null;
				continue;
			}

			// If we find # outside a string, remove rest of line
			if (char === '#' && !inString) {
				return line.substring(0, i);
			}
		}

		return line;
	}).join('\n');

	// Normalize Python line continuations (backslash at end of line)
	content = content.replace(/\\\s*[\r\n]+\s*/g, ' ');

	// Convert Python dict to JSON-like format
	let jsonStr = '{';

	// Split by commas (carefully, respecting nested structures)
	const pairs = smartSplit(content, ',');

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i].trim();
		if (!pair) continue;

		// Find the key and value
		const eqIdx = pair.indexOf('=');
		if (eqIdx === -1) continue;

		const key = pair.substring(0, eqIdx).trim();
		let value = pair.substring(eqIdx + 1).trim();

		// Convert value
		value = convertPythonValue(value);

		if (i > 0) jsonStr += ',';
		jsonStr += `"${key}":${value}`;
	}

	jsonStr += '}';

	// Parse the JSON
	try {
		return JSON.parse(jsonStr);
	} catch (e) {
		console.error('[ScriptOs Parser] JSON parse failed:', e);
		throw e;
	}
}

/**
 * Smart split that respects nested parentheses and strings
 */
function smartSplit(str: string, delimiter: string): string[] {
	const result: string[] = [];
	let current = '';
	let depth = 0;
	let inString = false;
	let stringChar: string | null = null;
	let escaped = false;

	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		const prevChar = i > 0 ? str[i - 1] : '';

		// Handle escape sequences
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === '\\') {
			escaped = true;
			current += char;
			continue;
		}

		// Handle string boundaries
		if ((char === '"' || char === "'" || char === '`') && !inString) {
			inString = true;
			stringChar = char;
			current += char;
			continue;
		}

		if (char === stringChar && inString && prevChar !== '\\') {
			inString = false;
			stringChar = null;
			current += char;
			continue;
		}

		// Skip processing if inside string
		if (inString) {
			current += char;
			continue;
		}

		// Track nesting depth
		if (char === '(' || char === '[' || char === '{') {
			depth++;
		} else if (char === ')' || char === ']' || char === '}') {
			depth--;
		}

		// Split on delimiter only at depth 0
		if (char === delimiter && depth === 0) {
			result.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	if (current.trim()) {
		result.push(current);
	}

	return result;
}

/**
 * Convert Python value to JSON value
 */
function convertPythonValue(value: string): string {
	value = value.trim();

	// Handle None
	if (value === 'None') return 'null';

	// Handle True/False
	if (value === 'True') return 'true';
	if (value === 'False') return 'false';

	// Handle numbers
	if (/^-?\d+(\.\d+)?$/.test(value)) return value;

	// Handle lists [...]
	if (value.startsWith('[') && value.endsWith(']')) {
		const listContent = value.substring(1, value.length - 1);
		const items = smartSplit(listContent, ',');
		const jsonItems = items.map(item => convertPythonValue(item));
		return '[' + jsonItems.join(',') + ']';
	}

	// Handle tuples (...)
	if (value.startsWith('(') && value.endsWith(')')) {
		const tupleContent = value.substring(1, value.length - 1);
		const items = smartSplit(tupleContent, ',');
		const jsonItems = items.map(item => convertPythonValue(item));
		return '[' + jsonItems.join(',') + ']';
	}

	// Handle nested dict(...)
	if (value.startsWith('dict(') && value.endsWith(')')) {
		const dictContent = value.substring(5, value.length - 1);
		return convertDictContent(dictContent);
	}

	// Handle nested dict {...} (Python dict literal)
	if (value.startsWith('{') && value.endsWith('}')) {
		const dictContent = value.substring(1, value.length - 1);
		return convertDictLiteral(dictContent);
	}

	// Handle concatenated strings with + (MUST be checked before quoted strings!)
	if (value.includes('+')) {
		const parts = value.split('+').map(p => {
			const trimmed = p.trim();
			if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
				return trimmed.substring(1, trimmed.length - 1);
			}
			return trimmed;
		});
		return JSON.stringify(parts.join(''));
	}

	// Handle strings (single or triple quoted, with or without quotes)
	if (value.startsWith("'''") || value.startsWith('"""')) {
		// Triple-quoted string - normalize newlines and extra spaces
		const quote = value.substring(0, 3);
		let str = value.substring(3, value.length - 3);
		// Normalize whitespace: replace multiple spaces/newlines with single space
		str = str.replace(/\s+/g, ' ').trim();
		return JSON.stringify(str);
	}

	if ((value.startsWith("'") && value.endsWith("'")) ||
		(value.startsWith('"') && value.endsWith('"'))) {
		// Single-quoted string - already has quotes, just return as is
		return JSON.stringify(value.substring(1, value.length - 1));
	}

	// Handle type references (str, int, float, bool, list, dict)
	if (value === 'str') return '"str"';
	if (value === 'int') return '"int"';
	if (value === 'float') return '"float"';
	if (value === 'bool') return '"bool"';
	if (value === 'list') return '"list"';
	if (value === 'dict') return '"dict"';

	// Default: treat as string
	return JSON.stringify(value);
}

/**
 * Convert dict content to JSON object
 */
function convertDictContent(dictContent: string): string {
	let jsonStr = '{';
	const pairs = smartSplit(dictContent, ',');
	let first = true;

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i].trim();
		if (!pair) continue;

		const eqIdx = pair.indexOf('=');
		if (eqIdx === -1) continue;

		const key = pair.substring(0, eqIdx).trim();
		let value = pair.substring(eqIdx + 1).trim();

		value = convertPythonValue(value);

		if (!first) jsonStr += ',';
		jsonStr += `"${key}":${value}`;
		first = false;
	}

	jsonStr += '}';
	return jsonStr;
}

/**
 * Convert Python dict literal { 'key': 'value' } to JSON
 */
function convertDictLiteral(dictContent: string): string {
	let jsonStr = '{';
	const pairs = smartSplit(dictContent, ',');
	let first = true;

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i].trim();
		if (!pair) continue;

		const colonIdx = pair.indexOf(':');
		if (colonIdx === -1) continue;

		let key = pair.substring(0, colonIdx).trim();
		let value = pair.substring(colonIdx + 1).trim();

		// Remove quotes from key if present
		if ((key.startsWith("'") && key.endsWith("'")) ||
			(key.startsWith('"') && key.endsWith('"'))) {
			key = key.substring(1, key.length - 1);
		}

		// Convert value
		value = convertPythonValue(value);

		if (!first) jsonStr += ',';
		jsonStr += `"${key}":${value}`;
		first = false;
	}

	jsonStr += '}';
	return jsonStr;
}

/**
 * Generate Python code from a ScriptO config and user values
 * @param scriptContent - Original ScriptO file content
 * @param config - Parsed config object
 * @param userValues - User-configured argument values
 * @returns Python code ready for execution
 */
export function generateScriptOsCode(
	scriptContent: string,
	config: ScriptOConfig,
	userValues: { [key: string]: any }
): string {
	const startMarker = '# === START_CONFIG_PARAMETERS ===';
	const endMarker = '# === END_CONFIG_PARAMETERS ===';

	const startIdx = scriptContent.indexOf(startMarker);
	const endIdx = scriptContent.indexOf(endMarker);

	// If no config block, return original
	if (startIdx === -1 || endIdx === -1) {
		return scriptContent;
	}

	// Get the parts
	const beforeConfig = scriptContent.substring(0, startIdx).trim();
	const afterConfig = scriptContent.substring(endIdx + endMarker.length).trim();

	// If no args to configure, just strip config and return
	if (!config.args || Object.keys(config.args).length === 0) {
		const info = config.info || {};
		let header = `# ${info.name || 'ScriptO'}\n`;
		if (info.description) {
			header += `# ${info.description}\n`;
		}
		if (info.author) {
			header += `# Author: ${info.author}\n`;
		}
		header += '\n';

		return header + (beforeConfig ? beforeConfig + '\n\n' : '') + afterConfig;
	}

	// Generate clean header
	const info = config.info || {};
	let generatedCode = `# ${info.name || 'ScriptO'}\n`;
	if (info.description) {
		generatedCode += `# ${info.description}\n`;
	}
	if (info.author) {
		generatedCode += `# Author: ${info.author}\n`;
	}
	generatedCode += '\n';

	// Add any code before config block
	if (beforeConfig) {
		generatedCode += beforeConfig + '\n\n';
	}

	// Generate args class with user values
	generatedCode += '# Configuration\n';
	generatedCode += 'class args:\n';

	for (const argId in config.args) {
		const argDef = config.args[argId];
		let value = userValues[argId];

		// Use default value if user didn't provide one
		if (value === undefined || value === null) {
			value = argDef.value;
		}

		// Convert JavaScript value to Python literal
		let pythonValue: string;
		if (value === undefined || value === null) {
			pythonValue = 'None';
		} else if (typeof value === 'string') {
			pythonValue = `'${escapePythonString(value)}'`;
		} else if (typeof value === 'boolean') {
			pythonValue = value ? 'True' : 'False';
		} else if (typeof value === 'number') {
			pythonValue = value.toString();
		} else if (Array.isArray(value)) {
			pythonValue = '[' + value.map(v =>
				typeof v === 'string' ? `'${escapePythonString(v)}'` : v
			).join(', ') + ']';
		} else {
			pythonValue = 'None';
		}

		generatedCode += `    ${argId} = ${pythonValue}\n`;
	}

	generatedCode += '\n';

	// Add code after config block
	if (afterConfig) {
		generatedCode += afterConfig;
	}

	return generatedCode;
}

/**
 * Helper to escape strings for Python
 */
function escapePythonString(str: string): string {
	return String(str)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
}

