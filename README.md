# n8n-nodes-bun

An [n8n](https://n8n.io) community node that lets you execute **TypeScript and JavaScript code using the [Bun](https://bun.sh) runtime** — with full system access, native TypeScript support, and all Bun APIs available.

Unlike the built-in Code node (which runs in a sandboxed VM), this node spawns a real Bun process. Your code can use the filesystem, network, Bun-specific APIs, npm packages, and anything else Bun supports.

![n8n Bun Code Node](https://img.shields.io/badge/n8n-community%20node-ff6d5a) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Native TypeScript** — Bun runs `.ts` files directly, no compilation step
- **Full Bun runtime** — access `Bun.file()`, `Bun.serve()`, `Bun.sleep()`, `fetch()`, and all Bun APIs
- **No sandbox** — code executes with full system access (read/write files, spawn processes, network calls)
- **Two execution modes** — "Run Once for All Items" and "Run Once for Each Item", matching the standard Code node
- **Full n8n Code node compatibility** — `$input`, `$json`, `$('NodeName')`, `$workflow`, `$execution`, `$env`, `$now`, `DateTime`, and more
- **Console output** — `console.log()` output is captured and included in the output items as `_stdout`
- **Error handling** — supports n8n's "Continue on Fail" setting
- **Configurable timeout** — default 60 seconds, adjustable per node (set to 0 for no limit)

## Prerequisites

- **n8n** — self-hosted instance (v1.0+)
- **Bun** — installed on the same machine running n8n

Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

Verify it's available:
```bash
bun --version
```

## Installation

### In n8n (Community Nodes)

1. Go to **Settings > Community Nodes**
2. Enter `n8n-nodes-bun`
3. Click **Install**
4. Restart n8n

### Manual / Docker

```bash
# From your n8n installation directory
npm install n8n-nodes-bun

# Restart n8n
```

For Docker, add to your Dockerfile:
```dockerfile
RUN npm install n8n-nodes-bun
```

> Make sure Bun is also installed in your Docker image. See [Bun Docker docs](https://bun.sh/guides/ecosystem/docker).

### From source

```bash
git clone https://github.com/borgius/n8n-nodes-bun.git
cd n8n-nodes-bun
npm install
npm run build

# Link into your n8n installation
npm link
cd /path/to/n8n
npm link n8n-nodes-bun
```

## Usage

After installation, search for **"Bun Code"** in the n8n node panel.

### Execution Modes

#### Run Once for All Items

Your code runs a single time and receives all input items at once. Return an array of items.

```typescript
// Access all input items
const items = $input.all();

// Transform each item
return items.map(item => ({
  json: {
    ...item.json,
    processed: true,
    timestamp: Date.now(),
  }
}));
```

#### Run Once for Each Item

Your code runs separately for each input item. Return a single item.

```typescript
// Access the current item
const item = $input.item;

// Transform it
return {
  json: {
    ...item.json,
    uppercased: item.json.name.toUpperCase(),
  }
};
```

### Available Variables

The Bun Code node supports the same built-in variables as the native n8n Code node, so you can use it as a drop-in replacement.

#### Input Data

| Variable | Mode | Description |
|----------|------|-------------|
| `$input.all()` | Both | Returns all input items as an array |
| `$input.first()` | Both | Returns the first input item |
| `$input.last()` | Both | Returns the last input item |
| `$input.item` | Each Item | The current item being processed |
| `items` | All Items | Alias for `$input.all()` — all input items |
| `item` | Each Item | Alias for `$input.item` — current item |
| `$json` | Both | Shortcut to the `.json` property of the first/current item |
| `$binary` | Both | Binary data of the first/current item |
| `$data` | Both | Alias for `$json` |

#### Accessing Other Nodes — `$()`

Access output data from any previously executed node in the workflow:

```typescript
// Get all items from a node
const webhookData = $('Webhook').all();

// Get the first item's json
const record = $('Postgres').first().json;

// Check specific items
const last = $('HTTP Request').last();
const matched = $('Transform').itemMatching(2);
```

The `$()` function returns an object with:

| Method / Property | Description |
|---|---|
| `.all()` | All output items from the node |
| `.first()` | First output item |
| `.last()` | Last output item |
| `.item` | First output item (property) |
| `.pairedItem(index?)` | Item at the given index |
| `.itemMatching(index)` | Item at the given index |
| `.isExecuted` | Always `true` (node must be executed to have data) |

The legacy `$items(nodeName?)` function is also available.

#### Workflow & Execution Context

| Variable | Description |
|---|---|
| `$workflow.id` | Workflow ID |
| `$workflow.name` | Workflow name |
| `$workflow.active` | Whether the workflow is active |
| `$execution.id` | Current execution ID |
| `$execution.mode` | Execution mode (`'manual'`, `'production'`, etc.) |
| `$execution.resumeUrl` | URL to resume a waiting execution |
| `$mode` | Same as `$execution.mode` |
| `$prevNode.name` | Name of the previous node |
| `$prevNode.outputIndex` | Output index of the connection from the previous node |
| `$prevNode.runIndex` | Run index of the previous node |

#### Item Position

| Variable | Description |
|---|---|
| `$itemIndex` | Current item index (each-item mode) |
| `$position` | Alias for `$itemIndex` |
| `$thisItemIndex` | Alias for `$itemIndex` |
| `$runIndex` | Current run index |
| `$thisRunIndex` | Alias for `$runIndex` |
| `$thisItem` | Current item reference |

#### Environment, Variables & Secrets

| Variable | Description |
|---|---|
| `$env` | Environment variables (e.g. `$env.MY_API_KEY`) |
| `$vars` | Workflow variables (e.g. `$vars.myVar`) |
| `$secrets` | External secrets (e.g. `$secrets.mySecret`) |

#### Node Parameters & Context

| Variable | Description |
|---|---|
| `$parameter` | Current node's parameters (resolved values) |
| `$self` | Node context data (read-only snapshot) |
| `$nodeId` | Current node's unique ID |
| `$nodeVersion` | Current node's type version |

#### Workflow Static Data

```typescript
// Read-only snapshot of workflow static data
const globalData = $getWorkflowStaticData('global');
const nodeData = $getWorkflowStaticData('node');
```

> **Note:** Static data is a read-only snapshot — modifications in the Bun process are not persisted back to n8n. For persistent storage, use a database or the filesystem.

#### Expression Evaluation

```typescript
// Pre-evaluated static expressions
const value = $evaluateExpression('{{ $json.name }}');
```

> **Note:** Only expressions with static string literals are supported — they are pre-evaluated on the n8n side before the Bun process starts. Dynamic expressions (built from variables at runtime) will throw an error.

#### Date & Time (Luxon)

If [Luxon](https://moment.github.io/luxon/) is available in node_modules (it ships with n8n), these globals are provided:

| Variable | Description |
|---|---|
| `$now` | Current date/time as a Luxon `DateTime` |
| `$today` | Today at midnight as a Luxon `DateTime` |
| `DateTime` | Luxon `DateTime` class |
| `Interval` | Luxon `Interval` class |
| `Duration` | Luxon `Duration` class |

If Luxon is not installed, `$now` and `$today` fall back to native JavaScript `Date` objects.

### Item Format

Each item follows the n8n data structure:

```typescript
{
  json: {
    // your data here
    key: "value",
    count: 42,
  }
}
```

When returning data, you can return either:
- **Proper n8n items** — objects with a `json` property: `{ json: { ... } }`
- **Plain objects** — automatically wrapped in `{ json: ... }` for you
- **Primitives** — wrapped as `{ json: { data: value } }`

## Examples

### Access other nodes' data

```typescript
// Merge data from two upstream nodes
const customers = $('Get Customers').all();
const orders = $('Get Orders').all();

return customers.map(c => {
  const customerOrders = orders.filter(
    o => o.json.customerId === c.json.id
  );
  return {
    json: {
      ...c.json,
      orderCount: customerOrders.length,
      totalSpent: customerOrders.reduce((sum, o) => sum + (o.json.amount as number), 0),
    }
  };
});
```

### Use TypeScript features

```typescript
interface User {
  name: string;
  email: string;
  age: number;
}

const users: User[] = $input.all().map(item => item.json as User);

const adults = users.filter(u => u.age >= 18);

return adults.map(u => ({
  json: { name: u.name, email: u.email, isAdult: true }
}));
```

### Read a file from disk

```typescript
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('/etc/myapp/config.json', 'utf-8'));

return [{ json: config }];
```

### Use Bun APIs

```typescript
// Read a file with Bun's fast API
const file = Bun.file('/tmp/data.csv');
const text = await file.text();

const rows = text.split('\n').map(line => {
  const [name, value] = line.split(',');
  return { json: { name, value } };
});

return rows;
```

### Make HTTP requests

```typescript
const response = await fetch('https://api.example.com/data', {
  headers: { 'Authorization': 'Bearer my-token' },
});

const data = await response.json();

return Array.isArray(data)
  ? data.map(item => ({ json: item }))
  : [{ json: data }];
```

### Hash passwords with Bun

```typescript
const items = $input.all();

return items.map(item => ({
  json: {
    ...item.json,
    passwordHash: Bun.hash(item.json.password as string).toString(),
  }
}));
```

### Run a shell command

```typescript
const proc = Bun.spawn(['ls', '-la', '/tmp']);
const output = await new Response(proc.stdout).text();

return [{
  json: {
    files: output.split('\n').filter(Boolean),
  }
}];
```

### Process items with async operations

```typescript
const items = $input.all();

const results = await Promise.all(
  items.map(async (item) => {
    const resp = await fetch(`https://api.example.com/enrich/${item.json.id}`);
    const extra = await resp.json();
    return {
      json: { ...item.json, ...extra },
    };
  })
);

return results;
```

## How It Works

1. Your code is parsed for `$('NodeName')` references — output data for those nodes is collected
2. Input items, referenced node data, and execution context are serialized to temp JSON files
3. Your code is wrapped in a template that provides all `$` helpers and written to a `.ts` file
4. `bun run script.ts` is spawned as a child process
5. Your code reads input, executes, and writes output to another temp JSON file
6. The node reads the output and passes it downstream in n8n
7. All temp files are cleaned up

```
n8n node                              Bun child process
┌──────────────────┐                  ┌─────────────────────┐
│ Parse $() refs   │                  │                     │
│ Collect node data│──input.json────> │ Read input          │
│ Collect context  │──nodeData.json─> │ Build $() accessor  │
│                  │──context.json─> │ Set up $workflow etc │
│                  │                  │ Execute user code   │
│ Parse output     │<-─output.json─── │ Write result        │
│ Capture stdout   │<─-── stdout ──── │ console.log() calls │
└──────────────────┘                  └─────────────────────┘
```

## Security Considerations

This node executes code **without any sandbox**. The Bun process has full access to:

- The filesystem (read/write any file the n8n process user can access)
- The network (make any outbound connections)
- Environment variables
- Child process spawning
- All Bun and Node.js APIs

**Only install this node on n8n instances where you trust all workflow editors.** It is not suitable for multi-tenant environments where untrusted users can create workflows.

## Limitations

- **`$evaluateExpression()`** — only static string literal expressions are supported (pre-evaluated before the Bun process starts). Dynamic expressions built at runtime will throw.
- **`$getWorkflowStaticData`** — provides a read-only snapshot. Modifications in the Bun process are **not** persisted back to n8n. Use files or a database for persistent storage.
- **`$fromAI()`** — AI-generated content placeholders are not available (requires AI agent runtime).
- **`$getPairedItem()`** — advanced paired item resolution is not available (requires full execution graph).
- **Credential helpers** — `helpers.httpRequestWithAuthentication` and credential access are not available. Use `fetch()` or Bun APIs directly with tokens from `$env` or `$secrets`.
- **Console output** — `console.log()` output is captured and attached to the first output item under the `_stdout` key. If your code produces no output items but has console output, a synthetic item with `_stdout` is created.
- **Dynamic `$()` references** — node names in `$('NodeName')` must be string literals in your code (not variables), since they are parsed statically before execution.
- **Execution timeout** — configurable per node (default 60 seconds). Set to 0 for no timeout. When exceeded, the error message clearly indicates a timeout.
- **Requires Bun installed** — the `bun` binary must be in the system PATH on the machine running n8n.

## Development

```bash
git clone https://github.com/borgius/n8n-nodes-bun.git
cd n8n-nodes-bun
npm install
npm run build     # compile TypeScript + copy assets
npm run dev       # watch mode (tsc --watch)
```

### Project structure

```
n8n-nodes-bun/
├── package.json                 # n8n community node registration
├── tsconfig.json
├── nodes/
│   └── BunCode/
│       ├── BunCode.node.ts      # Node class (UI config + execute)
│       ├── runBunCode.ts        # Bun execution engine
│       └── bunCode.svg          # Node icon
└── dist/                        # Build output (published to npm)
```

## License

[MIT](LICENSE)
