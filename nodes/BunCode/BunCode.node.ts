import {
	NodeConnectionTypes,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { runBunCode } from './runBunCode';

export class BunCode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bun Code',
		name: 'bunCode',
		icon: 'file:bunCode.svg',
		group: ['transform'],
		version: 1,
		description: 'Run TypeScript/JavaScript code using Bun runtime',
		defaults: {
			name: 'Bun Code',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		parameterPane: 'wide',
		properties: [
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
						description:
							'Run this code only once, no matter how many input items there are',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
						description:
							'Run this code as many times as there are input items',
					},
				],
				default: 'runOnceForAllItems',
			},
			{
				displayName: 'TypeScript/JavaScript Code',
				name: 'code',
				type: 'string',
				typeOptions: {
					editor: 'codeNodeEditor',
					editorLanguage: 'javaScript',
				},
				default:
					'// Access input items with $input.all()\nconst items = $input.all();\n\nreturn items;',
				noDataExpression: true,
				description:
					'TypeScript or JavaScript code to execute with Bun. Full Bun API available.',
				displayOptions: {
					show: {
						mode: ['runOnceForAllItems'],
					},
				},
			},
			{
				displayName: 'TypeScript/JavaScript Code',
				name: 'code',
				type: 'string',
				typeOptions: {
					editor: 'codeNodeEditor',
					editorLanguage: 'javaScript',
				},
				default:
					'// Access current item with $input.item\nconst item = $input.item;\n\nreturn item;',
				noDataExpression: true,
				description:
					'TypeScript or JavaScript code to execute with Bun. Full Bun API available.',
				displayOptions: {
					show: {
						mode: ['runOnceForEachItem'],
					},
				},
			},
			{
				displayName:
					'Bun natively supports TypeScript, top-level await, and fast built-in APIs. No sandbox — code runs with full system access. <a href="https://bun.sh/docs" target="_blank">Bun docs</a>',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const mode = this.getNodeParameter('mode', 0) as string;
		const code = this.getNodeParameter('code', 0) as string;
		const inputItems = this.getInputData();
		const proxy = this.getWorkflowDataProxy(0);

		// Extract $('NodeName') references from user code and collect their output data
		const nodeDataMap: Record<string, INodeExecutionData[]> = {};
		const nodeRefPattern = /\$\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
		let match: RegExpExecArray | null;
		while ((match = nodeRefPattern.exec(code)) !== null) {
			const nodeName = match[1];
			if (!(nodeName in nodeDataMap)) {
				try {
					nodeDataMap[nodeName] = proxy.$items(nodeName);
				} catch {
					// Node not found or not yet executed — skip
				}
			}
		}

		// Pre-evaluate $evaluateExpression('...') calls with static string arguments
		const evaluatedExpressions: Record<string, unknown> = {};
		const exprPattern = /\$evaluateExpression\(\s*(['"`])([^'"`]*)\1/g;
		let exprMatch: RegExpExecArray | null;
		while ((exprMatch = exprPattern.exec(code)) !== null) {
			const expression = exprMatch[2];
			if (!(expression in evaluatedExpressions)) {
				try {
					evaluatedExpressions[expression] = this.evaluateExpression(expression, 0);
				} catch {
					// Expression evaluation failed — will throw at runtime in subprocess
				}
			}
		}

		// Collect execution context for n8n Code node compatibility
		const node = this.getNode();
		const sourceData = this.getInputSourceData();

		// Safely extract proxy values that may be proxied objects
		let vars = {};
		let secrets = {};
		let parameter = {};
		let selfData = {};
		let staticDataGlobal = {};
		let staticDataNode = {};
		try { vars = JSON.parse(JSON.stringify(proxy.$vars ?? {})); } catch {}
		try { secrets = JSON.parse(JSON.stringify(proxy.$secrets ?? {})); } catch {}
		try { parameter = JSON.parse(JSON.stringify(proxy.$parameter ?? {})); } catch {}
		try { selfData = JSON.parse(JSON.stringify(this.getContext('node') ?? {})); } catch {}
		try { staticDataGlobal = JSON.parse(JSON.stringify(this.getWorkflowStaticData('global') ?? {})); } catch {}
		try { staticDataNode = JSON.parse(JSON.stringify(this.getWorkflowStaticData('node') ?? {})); } catch {}

		const executionContext = {
			workflow: this.getWorkflow(),
			execution: {
				id: this.getExecutionId(),
				mode: this.getMode(),
				resumeUrl: `${this.getRestApiUrl()}/waiting/${this.getExecutionId()}`,
			},
			node: {
				id: node.id,
				name: node.name,
				typeVersion: node.typeVersion,
				parameters: parameter,
			},
			prevNode: {
				name: sourceData.previousNode,
				outputIndex: sourceData.previousNodeOutput ?? 0,
				runIndex: sourceData.previousNodeRun ?? 0,
			},
			mode: this.getMode(),
			timezone: this.getTimezone(),
			env: process.env,
			vars,
			secrets,
			selfData,
			staticData: { global: staticDataGlobal, node: staticDataNode },
			evaluatedExpressions,
		};

		try {
			const result = await runBunCode(code, inputItems, mode, nodeDataMap, executionContext);
			return [result];
		} catch (error) {
			if (this.continueOnFail()) {
				return [[{ json: { error: (error as Error).message } }]];
			}
			throw new NodeOperationError(this.getNode(), error as Error);
		}
	}
}
