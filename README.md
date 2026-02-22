# n8n-nodes-bun

An [n8n](https://n8n.io) community node that lets you execute **TypeScript and JavaScript code using the [Bun](https://bun.sh) runtime** — with full system access, native TypeScript support, and all Bun APIs available.

Unlike the built-in Code node (which runs in a sandboxed VM), this node spawns a real Bun process. Your code can use the filesystem, network, Bun-specific APIs, npm packages, and anything else Bun supports.

![n8n Bun Code Node](https://img.shields.io/badge/n8n-community%20node-ff6d5a) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Native TypeScript** — Bun runs `.ts` files directly, no compilation step
- **Full Bun runtime** — access `Bun.file()`, `Bun.serve()`, `Bun.sleep()`, `fetch()`, and all Bun APIs
- **No sandbox** — code executes with full system access (read/write files, spawn processes, network calls)
- **Two execution modes** — "Run Once for All Items" and "Run Once for Each Item", matching the standard Code node
- **n8n-compatible helpers** — familiar `$input`, `$json`, `items` variables
- **Error handling** — supports n8n's "Continue on Fail" setting
- **60-second timeout** — prevents runaway scripts

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

| Variable | Mode | Description |
|----------|------|-------------|
| `$input.all()` | Both | Returns all input items as an array |
| `$input.first()` | Both | Returns the first input item |
| `$input.last()` | Both | Returns the last input item |
| `$input.item` | Each Item | The current item being processed |
| `items` | All Items | Alias for `$input.all()` — all input items |
| `item` | Each Item | Alias for `$input.item` — current item |
| `$json` | Both | Shortcut to the `.json` property of the first/current item |

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

1. Your code is wrapped in a template that provides the `$input`, `$json`, `items` helpers
2. The template + your code are written to a temporary `.ts` file
3. Input items are serialized to a temporary JSON file
4. `bun run script.ts` is spawned as a child process
5. Your code reads input, executes, and writes output to another temp JSON file
6. The node reads the output and passes it downstream in n8n
7. All temp files are cleaned up

```
n8n node                          Bun child process
┌─────────────┐                  ┌─────────────────┐
│ Serialize    │──input.json───> │ Read input       │
│ input items  │                 │ Provide helpers  │
│              │                 │ Execute user code│
│ Parse output │<─output.json── │ Write result     │
│ items        │                 │                  │
└─────────────┘                  └─────────────────┘
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

- **Binary data** — n8n binary attachments are not passed through to the Bun process. Work with `json` data or read files directly.
- **n8n context** — advanced n8n helpers like `$getWorkflowStaticData`, `helpers.httpRequestWithAuthentication`, and credential access are not available inside the Bun process. Use `fetch()` or Bun APIs directly.
- **Console output** — `console.log()` output from your code goes to the Bun process stderr/stdout and is not displayed in the n8n UI.
- **Execution timeout** — scripts are killed after 60 seconds.
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
