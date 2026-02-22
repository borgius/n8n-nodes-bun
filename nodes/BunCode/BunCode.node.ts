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

		try {
			const result = await runBunCode(code, inputItems, mode);
			return [result];
		} catch (error) {
			if (this.continueOnFail()) {
				return [[{ json: { error: (error as Error).message } }]];
			}
			throw new NodeOperationError(this.getNode(), error as Error);
		}
	}
}
