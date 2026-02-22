import { spawn } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { INodeExecutionData } from 'n8n-workflow';

function buildAllItemsTemplate(
	userCode: string,
	inputPath: string,
	outputPath: string,
): string {
	return `
import { readFileSync, writeFileSync } from 'fs';

const __inputData: any[] = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf-8'));

const $input = {
	all: () => __inputData,
	first: () => __inputData[0] ?? null,
	last: () => __inputData[__inputData.length - 1] ?? null,
	item: __inputData[0] ?? null,
};

const items = __inputData;
const $json = __inputData[0]?.json ?? {};

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
): string {
	return `
import { readFileSync, writeFileSync } from 'fs';

const __inputData: any[] = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf-8'));
const __results: any[] = [];

for (let __idx = 0; __idx < __inputData.length; __idx++) {
	const $input = {
		item: __inputData[__idx],
		all: () => __inputData,
		first: () => __inputData[0] ?? null,
		last: () => __inputData[__inputData.length - 1] ?? null,
	};

	const item = __inputData[__idx];
	const $json = __inputData[__idx].json ?? {};

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
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const proc = spawn('bun', ['run', scriptPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 60_000,
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

		proc.on('close', (exitCode: number | null) => {
			resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
		});
	});
}

export async function runBunCode(
	userCode: string,
	inputItems: INodeExecutionData[],
	mode: string,
): Promise<INodeExecutionData[]> {
	const tempDir = await mkdtemp(join(tmpdir(), 'n8n-bun-'));
	const inputPath = join(tempDir, 'input.json');
	const outputPath = join(tempDir, 'output.json');
	const scriptPath = join(tempDir, 'script.ts');

	try {
		await writeFile(inputPath, JSON.stringify(inputItems));

		const template =
			mode === 'runOnceForAllItems'
				? buildAllItemsTemplate(userCode, inputPath, outputPath)
				: buildEachItemTemplate(userCode, inputPath, outputPath);

		await writeFile(scriptPath, template);

		const { stderr, exitCode } = await executeBun(scriptPath);

		if (exitCode !== 0) {
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

		return JSON.parse(outputRaw) as INodeExecutionData[];
	} finally {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}
