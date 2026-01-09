#!/usr/bin/env node
/**
 * SwiftAgent MCP Server
 * 
 * Exposes Swift engineering agents, skills, and tools via the Model Context Protocol.
 * Run with: npx swift-agent-mcp or node dist/index.js
 * Test with: npx @modelcontextprotocol/inspector
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readdir, readFile, stat } from 'fs/promises';

// Resolve the project root (one level up from mcp-server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// Paths to SwiftAgent resources
const AGENTS_DIR = join(PROJECT_ROOT, '.github', 'agents');
const SKILLS_DIR = join(PROJECT_ROOT, '.github', 'skills');
const RULES_DIR = join(PROJECT_ROOT, 'rules');
const SCRIPTS_DIR = join(PROJECT_ROOT, 'scripts');

// Initialize the MCP Server
const server = new McpServer({
    name: 'swift-agent',
    version: '1.0.0'
});

// ============================================================================
// TOOL: list_resources
// Lists all available agents, skills, and rules
// ============================================================================
server.registerTool(
    'list_resources',
    {
        title: 'List SwiftAgent Resources',
        description: 'List all available agents, skills, and rules in SwiftAgent. Use this to discover what resources are available before loading them.',
        inputSchema: {
            type: z.enum(['all', 'agents', 'skills', 'rules']).optional().default('all')
        },
        outputSchema: {
            agents: z.array(z.string()).optional(),
            skills: z.array(z.string()).optional(),
            rules: z.array(z.string()).optional()
        }
    },
    async ({ type }) => {
        const result: { agents?: string[]; skills?: string[]; rules?: string[] } = {};

        try {
            if (type === 'all' || type === 'agents') {
                const agentFiles = await readdir(AGENTS_DIR);
                result.agents = agentFiles
                    .filter(f => f.endsWith('.md'))
                    .map(f => f.replace('.md', ''));
            }

            if (type === 'all' || type === 'skills') {
                const skillDirs = await readdir(SKILLS_DIR);
                const skills: string[] = [];
                for (const dir of skillDirs) {
                    const skillPath = join(SKILLS_DIR, dir);
                    const skillStat = await stat(skillPath);
                    if (skillStat.isDirectory()) {
                        skills.push(dir);
                    }
                }
                result.skills = skills;
            }

            if (type === 'all' || type === 'rules') {
                const ruleFiles = await readdir(RULES_DIR);
                result.rules = ruleFiles
                    .filter(f => f.endsWith('.md'))
                    .map(f => f.replace('.md', ''));
            }

            const summary = [
                result.agents ? `${result.agents.length} agents` : null,
                result.skills ? `${result.skills.length} skills` : null,
                result.rules ? `${result.rules.length} rules` : null
            ].filter(Boolean).join(', ');

            return {
                content: [{ type: 'text', text: `Found ${summary}:\n\n${JSON.stringify(result, null, 2)}` }],
                structuredContent: result
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Error listing resources: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: load_resource
// Loads the content of a specific agent, skill, or rule
// ============================================================================
server.registerTool(
    'load_resource',
    {
        title: 'Load SwiftAgent Resource',
        description: 'Load the full content of a specific agent, skill, or rule by name. Use list_resources first to see available options.',
        inputSchema: {
            resourceType: z.enum(['agent', 'skill', 'rule']),
            name: z.string().describe('Name of the resource to load (without .md extension)')
        },
        outputSchema: {
            name: z.string(),
            type: z.string(),
            content: z.string()
        }
    },
    async ({ resourceType, name }) => {
        try {
            let filePath: string;
            
            switch (resourceType) {
                case 'agent':
                    filePath = join(AGENTS_DIR, `${name}.md`);
                    break;
                case 'skill':
                    filePath = join(SKILLS_DIR, name, 'SKILL.md');
                    break;
                case 'rule':
                    filePath = join(RULES_DIR, `${name}.md`);
                    break;
            }

            const content = await readFile(filePath, 'utf-8');
            const output = { name, type: resourceType, content };

            return {
                content: [{ type: 'text', text: content }],
                structuredContent: output
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Error loading ${resourceType} "${name}": ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: search_swiftagent
// Search across all agents, skills, and rules by keyword
// ============================================================================
server.registerTool(
    'search_swiftagent',
    {
        title: 'Search SwiftAgent',
        description: 'Search for agents, skills, or rules containing a keyword. Searches file names and content.',
        inputSchema: {
            query: z.string().describe('Keyword to search for')
        },
        outputSchema: {
            matches: z.array(z.object({
                type: z.string(),
                name: z.string(),
                matchContext: z.string()
            }))
        }
    },
    async ({ query }) => {
        const matches: Array<{ type: string; name: string; matchContext: string }> = [];
        const queryLower = query.toLowerCase();

        try {
            // Search agents
            const agentFiles = await readdir(AGENTS_DIR);
            for (const file of agentFiles.filter(f => f.endsWith('.md'))) {
                const name = file.replace('.md', '');
                const content = await readFile(join(AGENTS_DIR, file), 'utf-8');
                if (name.toLowerCase().includes(queryLower) || content.toLowerCase().includes(queryLower)) {
                    const lines = content.split('\n');
                    const matchLine = lines.find(l => l.toLowerCase().includes(queryLower)) || lines[0];
                    matches.push({ type: 'agent', name, matchContext: matchLine.trim().slice(0, 100) });
                }
            }

            // Search skills
            const skillDirs = await readdir(SKILLS_DIR);
            for (const dir of skillDirs) {
                const skillPath = join(SKILLS_DIR, dir);
                const skillStat = await stat(skillPath);
                if (skillStat.isDirectory()) {
                    const skillFile = join(skillPath, 'SKILL.md');
                    try {
                        const content = await readFile(skillFile, 'utf-8');
                        if (dir.toLowerCase().includes(queryLower) || content.toLowerCase().includes(queryLower)) {
                            const lines = content.split('\n');
                            const matchLine = lines.find(l => l.toLowerCase().includes(queryLower)) || lines[0];
                            matches.push({ type: 'skill', name: dir, matchContext: matchLine.trim().slice(0, 100) });
                        }
                    } catch {
                        // Skill doesn't have SKILL.md, skip
                    }
                }
            }

            // Search rules
            const ruleFiles = await readdir(RULES_DIR);
            for (const file of ruleFiles.filter(f => f.endsWith('.md'))) {
                const name = file.replace('.md', '');
                const content = await readFile(join(RULES_DIR, file), 'utf-8');
                if (name.toLowerCase().includes(queryLower) || content.toLowerCase().includes(queryLower)) {
                    const lines = content.split('\n');
                    const matchLine = lines.find(l => l.toLowerCase().includes(queryLower)) || lines[0];
                    matches.push({ type: 'rule', name, matchContext: matchLine.trim().slice(0, 100) });
                }
            }

            const output = { matches };
            return {
                content: [{ type: 'text', text: `Found ${matches.length} matches for "${query}":\n\n${JSON.stringify(matches, null, 2)}` }],
                structuredContent: output
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Error searching: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: get_simulator
// Gets the best iOS Simulator UDID for builds
// ============================================================================
server.registerTool(
    'get_simulator',
    {
        title: 'Get iOS Simulator',
        description: 'Get the UDID of the best iOS Simulator for builds. Returns the currently booted simulator, last used, or a fallback.',
        inputSchema: {},
        outputSchema: {
            udid: z.string(),
            source: z.enum(['booted', 'last_used', 'fallback'])
        }
    },
    async () => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const scriptPath = join(SCRIPTS_DIR, 'get-recent-simulator.sh');
        
        try {
            const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
                timeout: 10000
            });
            
            const udid = stdout.trim();
            if (!udid || udid.startsWith('ERROR')) {
                return {
                    content: [{ type: 'text', text: `No simulator found: ${stderr || udid}` }],
                    isError: true
                };
            }
            
            const output = { udid, source: 'booted' as const };
            return {
                content: [{ type: 'text', text: `Simulator UDID: ${udid}` }],
                structuredContent: output
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Error getting simulator: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: search_codebase
// Search code using ripgrep (rg) or grep fallback
// ============================================================================
server.registerTool(
    'search_codebase',
    {
        title: 'Search Codebase',
        description: 'Search the codebase for a pattern using ripgrep. Returns file paths, line numbers, and matching lines.',
        inputSchema: {
            pattern: z.string().describe('Search pattern (regex supported)'),
            path: z.string().optional().describe('Optional subdirectory to search in'),
            fileType: z.string().optional().describe('File extension filter (e.g., "swift", "ts")')
        },
        outputSchema: {
            matches: z.array(z.object({
                file: z.string(),
                line: z.number(),
                content: z.string()
            })),
            totalMatches: z.number()
        }
    },
    async ({ pattern, path, fileType }) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const searchPath = path ? join(PROJECT_ROOT, path) : PROJECT_ROOT;
        
        // Build ripgrep command
        let cmd = `rg --json --max-count=50 "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
        if (fileType) {
            cmd += ` --type-add 'custom:*.${fileType}' --type custom`;
        }
        
        try {
            const { stdout } = await execAsync(cmd, {
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10 // 10MB
            });
            
            const matches: Array<{ file: string; line: number; content: string }> = [];
            
            for (const line of stdout.split('\n').filter(Boolean)) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'match') {
                        matches.push({
                            file: json.data.path.text.replace(PROJECT_ROOT + '/', ''),
                            line: json.data.line_number,
                            content: json.data.lines.text.trim().slice(0, 200)
                        });
                    }
                } catch {
                    // Skip malformed JSON lines
                }
            }
            
            const output = { matches, totalMatches: matches.length };
            return {
                content: [{ type: 'text', text: `Found ${matches.length} matches for "${pattern}":\n\n${matches.map(m => `${m.file}:${m.line}: ${m.content}`).join('\n')}` }],
                structuredContent: output
            };
        } catch (err) {
            const error = err as Error & { code?: number };
            // ripgrep returns exit code 1 when no matches found
            if (error.code === 1) {
                return {
                    content: [{ type: 'text', text: `No matches found for "${pattern}"` }],
                    structuredContent: { matches: [], totalMatches: 0 }
                };
            }
            return {
                content: [{ type: 'text', text: `Error searching: ${error.message}` }],
                isError: true
            };
        }
    }
);

// ============================================================================
// PROMPT REGISTRATION
// Dynamically register all agents as MCP prompts
// ============================================================================

interface AgentMeta {
    name: string;
    description: string;
    content: string;
}

async function parseAgentFrontmatter(content: string): Promise<{ description: string; body: string }> {
    // Parse YAML frontmatter from agent files
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
        return { description: 'Swift engineering agent', body: content };
    }
    
    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];
    
    // Extract description from frontmatter
    const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);
    const description = descMatch ? descMatch[1].trim() : 'Swift engineering agent';
    
    return { description, body };
}

async function registerAgentPrompts(): Promise<void> {
    try {
        const agentFiles = await readdir(AGENTS_DIR);
        
        for (const file of agentFiles.filter(f => f.endsWith('.md'))) {
            const agentName = file.replace('.md', '');
            const content = await readFile(join(AGENTS_DIR, file), 'utf-8');
            const { description, body } = await parseAgentFrontmatter(content);
            
            // Register each agent as a prompt
            server.registerPrompt(
                agentName,
                {
                    title: agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    description: description,
                    argsSchema: {
                        task: z.string().optional().describe('Optional task or question to focus the agent on')
                    }
                },
                ({ task }) => ({
                    messages: [{
                        role: 'user',
                        content: {
                            type: 'text',
                            text: task 
                                ? `${body}\n\n---\n\n**Your task:** ${task}`
                                : body
                        }
                    }]
                })
            );
        }
    } catch (err) {
        console.error('Error registering agent prompts:', err);
    }
}

// ============================================================================
// Start the server with stdio transport
// ============================================================================
async function main() {
    // Register all agent prompts before starting
    await registerAgentPrompts();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Log to stderr so it doesn't interfere with stdio protocol
    console.error('SwiftAgent MCP Server started');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
