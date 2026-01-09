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
// Start the server with stdio transport
// ============================================================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Log to stderr so it doesn't interfere with stdio protocol
    console.error('SwiftAgent MCP Server started');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
