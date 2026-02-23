import { spawn } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { INodeExecutionData } from 'n8n-workflow';

export interface ExecutionContext {
	workflow: { id?: string; name?: string; active: boolean };
	execution: { id: string; mode: string; resumeUrl: string };
	node: { id: string; name: string; typeVersion: number; parameters: Record<string, unknown> };
	prevNode: { name: string; outputIndex: number; runIndex: number };
	mode: string;
	timezone: string;
	env: Record<string, string | undefined>;
	vars: Record<string, unknown>;
	secrets: Record<string, unknown>;
	selfData: Record<string, unknown>;
	staticData: { global: Record<string, unknown>; node: Record<string, unknown> };
	evaluatedExpressions: Record<string, unknown>;
}

export interface RunBunCodeResult {
	items: INodeExecutionData[];
	stdout: string;
}

export interface RunBunCodeOptions {
	timeoutMs?: number;
}

/**
 * Builds the shared preamble injected into every subprocess script.
 * Provides all n8n Code-node compatible $ helpers.
 */
function buildPreamble(
	inputPath: string,
	nodeDataPath: string,
	contextPath: string,
): string {
	return `
import { readFileSync, writeFileSync } from 'fs';

// --- raw data ---
const __inputData: any[] = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf-8'));
const __nodeData: Record<string, any[]> = JSON.parse(readFileSync(${JSON.stringify(nodeDataPath)}, 'utf-8'));
const __ctx: any = JSON.parse(readFileSync(${JSON.stringify(contextPath)}, 'utf-8'));

// --- Luxon (best-effort) ---
let DateTime: any, Interval: any, Duration: any;
try {
	const luxon = require('luxon');
	DateTime = luxon.DateTime;
	Interval = luxon.Interval;
	Duration = luxon.Duration;
} catch {
	DateTime = Date;
	Interval = undefined;
	Duration = undefined;
}

// --- $() node accessor ---
function $(nodeName: string) {
	const items = __nodeData[nodeName];
	if (!items) throw new Error(\`No data found for node "\${nodeName}". Make sure the node exists, has been executed, and is referenced in your code as $('\${nodeName}').\`);
	return {
		all: (branchIndex?: number, runIndex?: number) => items,
		first: (branchIndex?: number, runIndex?: number) => items[0] ?? null,
		last: (branchIndex?: number, runIndex?: number) => items[items.length - 1] ?? null,
		item: items[0] ?? null,
		pairedItem: (itemIndex?: number) => items[itemIndex ?? 0] ?? null,
		itemMatching: (itemIndex: number) => items[itemIndex] ?? null,
		isExecuted: true,
		context: {},
		params: {},
	};
}

// --- $items() legacy function ---
function $items(nodeName?: string, outputIndex?: number, runIndex?: number) {
	if (!nodeName) return __inputData;
	return __nodeData[nodeName] ?? [];
}

// --- Workflow & execution context ---
const $workflow = __ctx.workflow ?? {};
const $execution = __ctx.execution ?? {};
const $prevNode = __ctx.prevNode ?? {};
const $mode = __ctx.mode ?? 'unknown';
const $nodeVersion = __ctx.node?.typeVersion ?? 1;
const $nodeId = __ctx.node?.id ?? '';

// --- Environment & variables ---
const $env = __ctx.env ?? {};
const $vars = __ctx.vars ?? {};
const $secrets = __ctx.secrets ?? {};

// --- Node parameters & context ---
const $parameter = __ctx.node?.parameters ?? {};
const $self = __ctx.selfData ?? {};

// --- Workflow static data (read-only snapshot) ---
function $getWorkflowStaticData(type: 'global' | 'node') {
	return __ctx.staticData?.[type] ?? {};
}

// --- Expression evaluator (pre-evaluated static expressions) ---
function $evaluateExpression(expression: string, _itemIndex?: number) {
	if (expression in (__ctx.evaluatedExpressions ?? {})) {
		return __ctx.evaluatedExpressions[expression];
	}
	throw new Error(
		\`Cannot evaluate expression "\${expression}" at runtime. Only static string literal expressions are supported in Bun Code. Use n8n expressions in node parameters instead.\`
	);
}

// --- Date/time helpers ---
const $now = DateTime === Date ? new Date() : DateTime.now();
const $today = DateTime === Date
	? new Date(new Date().setHours(0, 0, 0, 0))
	: DateTime.now().startOf('day');
`;
}

function buildAllItemsTemplate(
	userCode: string,
	inputPath: string,
	outputPath: string,
	nodeDataPath: string,
	contextPath: string,
): string {
	return `
${buildPreamble(inputPath, nodeDataPath, contextPath)}

const $input = {
	all: () => __inputData,
	first: () => __inputData[0] ?? null,
	last: () => __inputData[__inputData.length - 1] ?? null,
	item: __inputData[0] ?? null,
};

const items = __inputData;
const $json = __inputData[0]?.json ?? {};
const $binary = __inputData[0]?.binary ?? {};
const $data = $json;
const $position = 0;
const $itemIndex = 0;
const $thisItemIndex = 0;
const $runIndex = 0;
const $thisRunIndex = 0;
const $thisItem = __inputData[0] ?? null;

async function __userCode() {
${userCode}
}

const __result = await __userCode();

let __output: any[];
if (Array.isArray(__result)) {
	__output = __result.map((item: any) => {
		if (item && typeof item === 'object' && 'json' in item) return item;
		return { json: typeof item === 'object' && item !== null ? item : { data: item } };
	});
} else if (__result && typeof __result === 'object' && 'json' in __result) {
	__output = [__result];
} else if (__result !== null && __result !== undefined) {
	__output = [{ json: typeof __result === 'object' ? __result : { data: __result } }];
} else {
	__output = [];
}

writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(__output));
`;
}

function buildEachItemTemplate(
	userCode: string,
	inputPath: string,
	outputPath: string,
	nodeDataPath: string,
	contextPath: string,
): string {
	return `
${buildPreamble(inputPath, nodeDataPath, contextPath)}

const __results: any[] = [];

for (let __idx = 0; __idx < __inputData.length; __idx++) {
	const $input = {
		item: __inputData[__idx],
		all: () => __inputData,
		first: () => __inputData[0] ?? null,
		last: () => __inputData[__inputData.length - 1] ?? null,
	};

	const item = __inputData[__idx];
	const $json = __inputData[__idx]?.json ?? {};
	const $binary = __inputData[__idx]?.binary ?? {};
	const $data = $json;
	const $position = __idx;
	const $itemIndex = __idx;
	const $thisItemIndex = __idx;
	const $runIndex = 0;
	const $thisRunIndex = 0;
	const $thisItem = __inputData[__idx] ?? null;

	const __runUserCode = async () => {
${userCode}
	};

	const __itemResult = await __runUserCode();

	if (__itemResult !== null && __itemResult !== undefined) {
		let __normalized: any;
		if (typeof __itemResult === 'object' && 'json' in __itemResult) {
			__normalized = __itemResult;
		} else if (typeof __itemResult === 'object' && __itemResult !== null) {
			__normalized = { json: __itemResult };
		} else {
			__normalized = { json: { data: __itemResult } };
		}
		__normalized.pairedItem = { item: __idx };
		__results.push(__normalized);
	}
}

writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(__results));
`;
}

function executeBun(
	scriptPath: string,
	nodePath?: string,
	timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number; signal?: string }> {
	return new Promise((resolve, reject) => {
		const spawnEnv = { ...process.env };
		if (nodePath) {
			spawnEnv.NODE_PATH = nodePath + (spawnEnv.NODE_PATH ? `:${spawnEnv.NODE_PATH}` : '');
		}
		const proc = spawn('bun', ['run', scriptPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
			...(timeoutMs ? { timeout: timeoutMs } : {}),
			env: spawnEnv,
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});
		proc.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				reject(
					new Error(
						'Bun runtime not found. Please install Bun: https://bun.sh',
					),
				);
			} else {
				reject(err);
			}
		});

		proc.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
			resolve({ stdout, stderr, exitCode: exitCode ?? 1, signal: signal ?? undefined });
		});
	});
}

export async function runBunCode(
	userCode: string,
	inputItems: INodeExecutionData[],
	mode: string,
	nodeDataMap: Record<string, INodeExecutionData[]> = {},
	executionContext: ExecutionContext = {
		workflow: { active: false },
		execution: { id: '', mode: 'manual', resumeUrl: '' },
		node: { id: '', name: '', typeVersion: 1, parameters: {} },
		prevNode: { name: '', outputIndex: 0, runIndex: 0 },
		mode: 'manual',
		timezone: 'UTC',
		env: {},
		vars: {},
		secrets: {},
		selfData: {},
		staticData: { global: {}, node: {} },
		evaluatedExpressions: {},
	},
	options: RunBunCodeOptions = {},
): Promise<RunBunCodeResult> {
	const tempDir = await mkdtemp(join(tmpdir(), 'n8n-bun-'));
	const inputPath = join(tempDir, 'input.json');
	const outputPath = join(tempDir, 'output.json');
	const nodeDataPath = join(tempDir, 'nodeData.json');
	const contextPath = join(tempDir, 'context.json');
	const scriptPath = join(tempDir, 'script.ts');

	try {
		await writeFile(inputPath, JSON.stringify(inputItems));
		await writeFile(nodeDataPath, JSON.stringify(nodeDataMap));
		await writeFile(contextPath, JSON.stringify(executionContext));

		const template =
			mode === 'runOnceForAllItems'
				? buildAllItemsTemplate(userCode, inputPath, outputPath, nodeDataPath, contextPath)
				: buildEachItemTemplate(userCode, inputPath, outputPath, nodeDataPath, contextPath);

		await writeFile(scriptPath, template);

		// Resolve custom node_modules for require() in user code
		// __dirname: .../node_modules/n8n-nodes-bun/dist/nodes/BunCode
		const customNodeModules = join(__dirname, '..', '..', '..', '..');
		const { stdout, stderr, exitCode, signal } = await executeBun(
			scriptPath,
			customNodeModules,
			options.timeoutMs,
		);

		if (exitCode !== 0) {
			if (signal === 'SIGTERM') {
				const timeoutSec = (options.timeoutMs ?? 0) / 1000;
				throw new Error(
					`Bun execution timed out after ${timeoutSec} seconds`,
				);
			}
			throw new Error(
				`Bun execution failed (exit code ${exitCode}):\n${stderr}`,
			);
		}

		let outputRaw: string;
		try {
			outputRaw = await readFile(outputPath, 'utf-8');
		} catch {
			throw new Error(
				`Code did not produce output. Make sure your code returns data.\n${stderr}`,
			);
		}

		return {
			items: JSON.parse(outputRaw) as INodeExecutionData[],
			stdout,
		};
	} finally {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}
