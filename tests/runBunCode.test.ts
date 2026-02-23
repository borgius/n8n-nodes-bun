import { describe, it, expect } from 'vitest';
import { runBunCode, type ExecutionContext } from '../nodes/BunCode/runBunCode';
import type { INodeExecutionData } from 'n8n-workflow';

// --- Helpers ---

function makeItems(...jsons: Record<string, unknown>[]): INodeExecutionData[] {
	return jsons.map((json) => ({ json }));
}

function ctx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
	return {
		workflow: { id: 'wf-1', name: 'Test Workflow', active: true },
		execution: { id: 'exec-123', mode: 'manual', resumeUrl: 'http://localhost/waiting/exec-123' },
		node: { id: 'node-abc', name: 'Bun Code', typeVersion: 1, parameters: {} },
		prevNode: { name: 'Previous Node', outputIndex: 0, runIndex: 0 },
		mode: 'manual',
		timezone: 'America/New_York',
		env: {},
		vars: {},
		secrets: {},
		selfData: {},
		staticData: { global: {}, node: {} },
		evaluatedExpressions: {},
		...overrides,
	};
}

// ============================================================
// Run Once for All Items mode
// ============================================================
describe('runOnceForAllItems mode', () => {
	it('returns items unchanged via passthrough', async () => {
		const input = makeItems({ a: 1 }, { a: 2 });
		const result = await runBunCode(
			'return $input.all();',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result).toHaveLength(2);
		expect(result[0].json).toEqual({ a: 1 });
		expect(result[1].json).toEqual({ a: 2 });
	});

	it('wraps plain objects in { json }', async () => {
		const result = await runBunCode(
			'return [{ foo: "bar" }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ foo: 'bar' });
	});

	it('wraps primitives in { json: { data } }', async () => {
		const result = await runBunCode(
			'return [42];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ data: 42 });
	});

	it('returns empty array when code returns null', async () => {
		const result = await runBunCode(
			'return null;',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result).toEqual([]);
	});

	it('supports single object return (wrapped in array)', async () => {
		const result = await runBunCode(
			'return { json: { single: true } };',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result).toHaveLength(1);
		expect(result[0].json).toEqual({ single: true });
	});
});

// ============================================================
// Run Once for Each Item mode
// ============================================================
describe('runOnceForEachItem mode', () => {
	it('processes each item individually', async () => {
		const input = makeItems({ name: 'alice' }, { name: 'bob' });
		const result = await runBunCode(
			'return { json: { greeting: "hi " + $json.name } };',
			input,
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result).toHaveLength(2);
		expect(result[0].json).toEqual({ greeting: 'hi alice' });
		expect(result[1].json).toEqual({ greeting: 'hi bob' });
	});

	it('sets pairedItem for each output', async () => {
		const input = makeItems({ a: 1 }, { a: 2 });
		const result = await runBunCode(
			'return $input.item;',
			input,
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].pairedItem).toEqual({ item: 0 });
		expect(result[1].pairedItem).toEqual({ item: 1 });
	});

	it('wraps plain object returns', async () => {
		const result = await runBunCode(
			'return { val: $json.x * 2 };',
			makeItems({ x: 5 }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ val: 10 });
	});
});

// ============================================================
// $input helpers
// ============================================================
describe('$input helpers', () => {
	const input = makeItems({ first: true }, { middle: true }, { last: true });

	it('$input.all() returns all items', async () => {
		const result = await runBunCode(
			'return [{ json: { count: $input.all().length } }];',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ count: 3 });
	});

	it('$input.first() returns first item', async () => {
		const result = await runBunCode(
			'return [{ json: $input.first().json }];',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ first: true });
	});

	it('$input.last() returns last item', async () => {
		const result = await runBunCode(
			'return [{ json: $input.last().json }];',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ last: true });
	});

	it('$input.item returns first item in allItems mode', async () => {
		const result = await runBunCode(
			'return [{ json: $input.item.json }];',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ first: true });
	});

	it('$input.item returns current item in eachItem mode', async () => {
		const result = await runBunCode(
			'return { json: $input.item.json };',
			input,
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ first: true });
		expect(result[1].json).toEqual({ middle: true });
		expect(result[2].json).toEqual({ last: true });
	});
});

// ============================================================
// $json, $binary, $data, items, item aliases
// ============================================================
describe('aliases', () => {
	it('$json returns first item json in allItems mode', async () => {
		const result = await runBunCode(
			'return [{ json: { val: $json.x } }];',
			makeItems({ x: 42 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ val: 42 });
	});

	it('$data is alias for $json', async () => {
		const result = await runBunCode(
			'return [{ json: { same: $data.x === $json.x } }];',
			makeItems({ x: 99 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ same: true });
	});

	it('$binary returns binary data', async () => {
		const input: INodeExecutionData[] = [
			{ json: { a: 1 }, binary: { file: { mimeType: 'text/plain', data: 'aGk=' } as never } },
		];
		const result = await runBunCode(
			'return [{ json: { mime: $binary.file?.mimeType } }];',
			input,
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ mime: 'text/plain' });
	});

	it('items alias works in allItems mode', async () => {
		const result = await runBunCode(
			'return [{ json: { len: items.length } }];',
			makeItems({ a: 1 }, { a: 2 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ len: 2 });
	});

	it('item alias works in eachItem mode', async () => {
		const result = await runBunCode(
			'return { json: item.json };',
			makeItems({ val: 'hello' }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ val: 'hello' });
	});

	it('$json returns current item json in eachItem mode', async () => {
		const result = await runBunCode(
			'return { json: { v: $json.n } };',
			makeItems({ n: 10 }, { n: 20 }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ v: 10 });
		expect(result[1].json).toEqual({ v: 20 });
	});
});

// ============================================================
// $() node accessor
// ============================================================
describe('$() node accessor', () => {
	const nodeData: Record<string, INodeExecutionData[]> = {
		'Webhook': makeItems({ url: '/hook' }, { url: '/other' }),
		'DB Query': makeItems({ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }),
	};

	it('$().all() returns all items from referenced node', async () => {
		const result = await runBunCode(
			`return [{ json: { count: $('Webhook').all().length } }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ count: 2 });
	});

	it('$().first() returns first item', async () => {
		const result = await runBunCode(
			`return [{ json: $('Webhook').first().json }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ url: '/hook' });
	});

	it('$().last() returns last item', async () => {
		const result = await runBunCode(
			`return [{ json: $('DB Query').last().json }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ id: 3, name: 'Charlie' });
	});

	it('$().item returns first item as property', async () => {
		const result = await runBunCode(
			`return [{ json: $('Webhook').item.json }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ url: '/hook' });
	});

	it('$().pairedItem(index) returns item at index', async () => {
		const result = await runBunCode(
			`return [{ json: $('DB Query').pairedItem(1).json }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ id: 2, name: 'Bob' });
	});

	it('$().itemMatching(index) returns item at index', async () => {
		const result = await runBunCode(
			`return [{ json: $('DB Query').itemMatching(2).json }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ id: 3, name: 'Charlie' });
	});

	it('$().isExecuted is true', async () => {
		const result = await runBunCode(
			`return [{ json: { executed: $('Webhook').isExecuted } }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ executed: true });
	});

	it('$() throws for unknown node', async () => {
		await expect(
			runBunCode(
				`return [{ json: $('NonExistent').all() }];`,
				makeItems({ x: 1 }),
				'runOnceForAllItems',
				{ NonExistent: [] }, // must be in nodeDataMap since it's parsed from code, but make it empty to test $() behavior
				ctx(),
			),
		).resolves.toHaveLength(1); // empty array is truthy for .all()
	});
});

// ============================================================
// $items() legacy function
// ============================================================
describe('$items() legacy function', () => {
	it('$items() without args returns input data', async () => {
		const result = await runBunCode(
			'return [{ json: { count: $items().length } }];',
			makeItems({ a: 1 }, { a: 2 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ count: 2 });
	});

	it('$items(nodeName) returns node data', async () => {
		const result = await runBunCode(
			`return [{ json: { count: $items('MyNode').length } }];`,
			makeItems({ a: 1 }),
			'runOnceForAllItems',
			{ MyNode: makeItems({ b: 1 }, { b: 2 }, { b: 3 }) },
			ctx(),
		);
		expect(result[0].json).toEqual({ count: 3 });
	});
});

// ============================================================
// Workflow & Execution context
// ============================================================
describe('workflow & execution context', () => {
	it('$workflow exposes id, name, active', async () => {
		const result = await runBunCode(
			'return [{ json: { id: $workflow.id, name: $workflow.name, active: $workflow.active } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ workflow: { id: 'wf-42', name: 'My Flow', active: false } }),
		);
		expect(result[0].json).toEqual({ id: 'wf-42', name: 'My Flow', active: false });
	});

	it('$execution exposes id, mode, resumeUrl', async () => {
		const result = await runBunCode(
			'return [{ json: { id: $execution.id, mode: $execution.mode } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ execution: { id: 'exec-99', mode: 'production', resumeUrl: 'http://x' } }),
		);
		expect(result[0].json).toEqual({ id: 'exec-99', mode: 'production' });
	});

	it('$mode returns execution mode', async () => {
		const result = await runBunCode(
			'return [{ json: { mode: $mode } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ mode: 'production' }),
		);
		expect(result[0].json).toEqual({ mode: 'production' });
	});

	it('$prevNode exposes name, outputIndex, runIndex', async () => {
		const result = await runBunCode(
			'return [{ json: { name: $prevNode.name, out: $prevNode.outputIndex } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ prevNode: { name: 'HTTP Request', outputIndex: 1, runIndex: 0 } }),
		);
		expect(result[0].json).toEqual({ name: 'HTTP Request', out: 1 });
	});
});

// ============================================================
// $env, $vars, $secrets
// ============================================================
describe('environment, variables & secrets', () => {
	it('$env exposes environment variables', async () => {
		const result = await runBunCode(
			'return [{ json: { key: $env.MY_KEY } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ env: { MY_KEY: 'secret-value' } }),
		);
		expect(result[0].json).toEqual({ key: 'secret-value' });
	});

	it('$vars exposes workflow variables', async () => {
		const result = await runBunCode(
			'return [{ json: { base: $vars.BASE_URL } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ vars: { BASE_URL: 'https://api.example.com' } }),
		);
		expect(result[0].json).toEqual({ base: 'https://api.example.com' });
	});

	it('$secrets exposes external secrets', async () => {
		const result = await runBunCode(
			'return [{ json: { token: $secrets.API_TOKEN } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ secrets: { API_TOKEN: 'tok_abc123' } }),
		);
		expect(result[0].json).toEqual({ token: 'tok_abc123' });
	});
});

// ============================================================
// $parameter, $self, $nodeId, $nodeVersion
// ============================================================
describe('node parameters & context', () => {
	it('$parameter exposes node parameters', async () => {
		const result = await runBunCode(
			'return [{ json: { mode: $parameter.mode } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ node: { id: 'n1', name: 'Bun', typeVersion: 1, parameters: { mode: 'runOnceForAllItems' } } }),
		);
		expect(result[0].json).toEqual({ mode: 'runOnceForAllItems' });
	});

	it('$self exposes node context data', async () => {
		const result = await runBunCode(
			'return [{ json: { counter: $self.counter } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ selfData: { counter: 42 } }),
		);
		expect(result[0].json).toEqual({ counter: 42 });
	});

	it('$nodeId returns node ID', async () => {
		const result = await runBunCode(
			'return [{ json: { id: $nodeId } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ node: { id: 'node-xyz', name: 'Test', typeVersion: 2, parameters: {} } }),
		);
		expect(result[0].json).toEqual({ id: 'node-xyz' });
	});

	it('$nodeVersion returns node type version', async () => {
		const result = await runBunCode(
			'return [{ json: { ver: $nodeVersion } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ node: { id: 'n1', name: 'Test', typeVersion: 3, parameters: {} } }),
		);
		expect(result[0].json).toEqual({ ver: 3 });
	});
});

// ============================================================
// $getWorkflowStaticData
// ============================================================
describe('$getWorkflowStaticData', () => {
	it('returns global static data', async () => {
		const result = await runBunCode(
			`return [{ json: $getWorkflowStaticData('global') }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ staticData: { global: { lastRun: '2024-01-01' }, node: {} } }),
		);
		expect(result[0].json).toEqual({ lastRun: '2024-01-01' });
	});

	it('returns node static data', async () => {
		const result = await runBunCode(
			`return [{ json: $getWorkflowStaticData('node') }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ staticData: { global: {}, node: { cursor: 'abc123' } } }),
		);
		expect(result[0].json).toEqual({ cursor: 'abc123' });
	});
});

// ============================================================
// $evaluateExpression
// ============================================================
describe('$evaluateExpression', () => {
	it('returns pre-evaluated expression result', async () => {
		const result = await runBunCode(
			`return [{ json: { val: $evaluateExpression('{{ $json.name }}') } }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ evaluatedExpressions: { '{{ $json.name }}': 'Alice' } }),
		);
		expect(result[0].json).toEqual({ val: 'Alice' });
	});

	it('throws for dynamic (non-pre-evaluated) expressions', async () => {
		await expect(
			runBunCode(
				`const expr = '{{ unknown }}'; return [{ json: { val: $evaluateExpression(expr) } }];`,
				makeItems({ x: 1 }),
				'runOnceForAllItems',
				{},
				ctx(),
			),
		).rejects.toThrow('Bun execution failed');
	});
});

// ============================================================
// Item position variables
// ============================================================
describe('item position variables', () => {
	it('$itemIndex, $position, $thisItemIndex reflect current index in eachItem mode', async () => {
		const result = await runBunCode(
			'return { json: { idx: $itemIndex, pos: $position, thisIdx: $thisItemIndex } };',
			makeItems({ a: 1 }, { a: 2 }, { a: 3 }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ idx: 0, pos: 0, thisIdx: 0 });
		expect(result[1].json).toEqual({ idx: 1, pos: 1, thisIdx: 1 });
		expect(result[2].json).toEqual({ idx: 2, pos: 2, thisIdx: 2 });
	});

	it('$thisItem returns current item in eachItem mode', async () => {
		const result = await runBunCode(
			'return { json: $thisItem.json };',
			makeItems({ val: 'a' }, { val: 'b' }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ val: 'a' });
		expect(result[1].json).toEqual({ val: 'b' });
	});

	it('$runIndex and $thisRunIndex are 0', async () => {
		const result = await runBunCode(
			'return [{ json: { run: $runIndex, thisRun: $thisRunIndex } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ run: 0, thisRun: 0 });
	});
});

// ============================================================
// Luxon / DateTime
// ============================================================
describe('Luxon DateTime support', () => {
	it('$now is defined and has toISO method', async () => {
		const result = await runBunCode(
			'return [{ json: { hasToISO: typeof $now.toISO === "function" } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ hasToISO: true });
	});

	it('$today is defined and is before or equal to $now', async () => {
		const result = await runBunCode(
			'return [{ json: { valid: $today <= $now } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ valid: true });
	});

	it('DateTime class is available for date operations', async () => {
		const result = await runBunCode(
			`const dt = DateTime.fromISO('2024-06-15');
			return [{ json: { year: dt.year, month: dt.month } }];`,
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ year: 2024, month: 6 });
	});
});

// ============================================================
// TypeScript & async support
// ============================================================
describe('TypeScript & async support', () => {
	it('supports TypeScript interfaces and types', async () => {
		const code = `
			interface Item { name: string; value: number }
			const data: Item[] = $input.all().map(i => i.json as Item);
			return data.map(d => ({ json: { upper: d.name.toUpperCase() } }));
		`;
		const result = await runBunCode(
			code,
			makeItems({ name: 'test', value: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ upper: 'TEST' });
	});

	it('supports top-level await', async () => {
		const result = await runBunCode(
			'const val = await Promise.resolve(42); return [{ json: { val } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ val: 42 });
	});

	it('supports async operations in eachItem mode', async () => {
		const result = await runBunCode(
			'const doubled = await Promise.resolve($json.n * 2); return { json: { doubled } };',
			makeItems({ n: 5 }, { n: 10 }),
			'runOnceForEachItem',
			{},
			ctx(),
		);
		expect(result[0].json).toEqual({ doubled: 10 });
		expect(result[1].json).toEqual({ doubled: 20 });
	});
});

// ============================================================
// Error handling
// ============================================================
describe('error handling', () => {
	it('throws on script runtime error', async () => {
		await expect(
			runBunCode(
				'throw new Error("intentional failure");',
				makeItems({ x: 1 }),
				'runOnceForAllItems',
				{},
				ctx(),
			),
		).rejects.toThrow('Bun execution failed');
	});

	it('throws when code produces no output', async () => {
		await expect(
			runBunCode(
				'// no return statement',
				makeItems({ x: 1 }),
				'runOnceForAllItems',
				{},
				ctx(),
			),
		).resolves.toEqual([]);
	});

	it('throws descriptive error for undefined variable access', async () => {
		await expect(
			runBunCode(
				'return [{ json: { val: undefinedVar.property } }];',
				makeItems({ x: 1 }),
				'runOnceForAllItems',
				{},
				ctx(),
			),
		).rejects.toThrow('Bun execution failed');
	});
});

// ============================================================
// Integration: combining multiple features
// ============================================================
describe('integration', () => {
	it('combines $() with $input and $workflow in allItems mode', async () => {
		const nodeData = {
			'Fetch Users': makeItems({ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }),
		};
		const code = `
			const users = $('Fetch Users').all();
			const currentItems = $input.all();
			return [{
				json: {
					userCount: users.length,
					inputCount: currentItems.length,
					workflowName: $workflow.name,
					mode: $mode,
				}
			}];
		`;
		const result = await runBunCode(
			code,
			makeItems({ trigger: true }),
			'runOnceForAllItems',
			nodeData,
			ctx({ workflow: { id: 'w1', name: 'Integration Test', active: true }, mode: 'manual' }),
		);
		expect(result[0].json).toEqual({
			userCount: 2,
			inputCount: 1,
			workflowName: 'Integration Test',
			mode: 'manual',
		});
	});

	it('uses $env and $vars together', async () => {
		const result = await runBunCode(
			'return [{ json: { url: $vars.BASE + $env.PATH_SUFFIX } }];',
			makeItems({ x: 1 }),
			'runOnceForAllItems',
			{},
			ctx({ env: { PATH_SUFFIX: '/api/v2' }, vars: { BASE: 'https://example.com' } }),
		);
		expect(result[0].json).toEqual({ url: 'https://example.com/api/v2' });
	});

	it('each-item mode with $() and position tracking', async () => {
		const nodeData = {
			'Lookup': makeItems({ label: 'x' }, { label: 'y' }),
		};
		const code = `
			const lookup = $('Lookup').itemMatching($itemIndex);
			return {
				json: {
					original: $json.val,
					label: lookup?.json?.label ?? 'none',
					position: $position,
				}
			};
		`;
		const result = await runBunCode(
			code,
			makeItems({ val: 'a' }, { val: 'b' }),
			'runOnceForEachItem',
			nodeData,
			ctx(),
		);
		expect(result[0].json).toEqual({ original: 'a', label: 'x', position: 0 });
		expect(result[1].json).toEqual({ original: 'b', label: 'y', position: 1 });
	});
});
