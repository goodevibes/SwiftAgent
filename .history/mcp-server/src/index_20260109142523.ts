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
const SWIFTAGENT_ROOT = resolve(__dirname, '..', '..');

// Paths to SwiftAgent resources (skills, agents, rules)
const AGENTS_DIR = join(SWIFTAGENT_ROOT, '.github', 'agents');
const SKILLS_DIR = join(SWIFTAGENT_ROOT, '.github', 'skills');
const RULES_DIR = join(SWIFTAGENT_ROOT, 'rules');
const SCRIPTS_DIR = join(SWIFTAGENT_ROOT, 'scripts');

// Environment with Homebrew paths for tools like ripgrep
const SHELL_ENV = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
};

// Get the current working directory (user's project, not SwiftAgent)
function getWorkspace(workspacePath?: string): string {
    if (workspacePath) return workspacePath;
    return process.cwd();
}

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
            workspace: z.string().optional().describe('Path to workspace/project to search (defaults to current directory)'),
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
    async ({ pattern, workspace, path, fileType }) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const { rgPath } = await import('@vscode/ripgrep'); // Use bundled binary
        const execAsync = promisify(exec);
        
        const workspaceRoot = getWorkspace(workspace);
        const searchPath = path ? join(workspaceRoot, path) : workspaceRoot;
        
        // Build ripgrep command using the absolute path to the binary
        let cmd = `"${rgPath}" --json --max-count=50 "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
        if (fileType) {
            cmd += ` --type-add 'custom:*.${fileType}' --type custom`;
        }
        
        try {
            const { stdout } = await execAsync(cmd, {
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10,
                env: SHELL_ENV
            });
            
            const matches: Array<{ file: string; line: number; content: string }> = [];
            
            for (const line of stdout.split('\n').filter(Boolean)) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'match') {
                        matches.push({
                            file: json.data.path.text.replace(workspaceRoot + '/', ''),
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
// TOOL: run_swift_build
// Build the Xcode project
// ============================================================================
server.registerTool(
    'run_swift_build',
    {
        title: 'Build Swift Project',
        description: 'Build the Xcode project using xcodebuild. Returns build status and any errors.',
        inputSchema: {
            workspace: z.string().optional().describe('Path to Xcode project workspace'),
            scheme: z.string().optional().describe('Xcode scheme to build'),
            configuration: z.enum(['Debug', 'Release']).optional().default('Debug'),
            destination: z.string().optional().describe('Build destination (e.g., simulator UDID)')
        },
        outputSchema: {
            success: z.boolean(),
            output: z.string(),
            errors: z.array(z.string()).optional()
        }
    },
    async ({ workspace, scheme, configuration, destination }) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const workspaceRoot = getWorkspace(workspace);
        
        let cmd = 'xcodebuild';
        if (scheme) cmd += ` -scheme "${scheme}"`;
        cmd += ` -configuration ${configuration || 'Debug'}`;
        if (destination) cmd += ` -destination "id=${destination}"`;
        cmd += ' build 2>&1 | tail -50';
        
        try {
            const { stdout } = await execAsync(cmd, {
                cwd: workspaceRoot,
                timeout: 300000,
                maxBuffer: 1024 * 1024 * 50,
                env: SHELL_ENV
            });
            
            const success = stdout.includes('BUILD SUCCEEDED');
            const errors = stdout.match(/error:.*$/gm) || [];
            
            return {
                content: [{ type: 'text', text: success ? '✅ Build succeeded' : `❌ Build failed:\n${errors.join('\n')}` }],
                structuredContent: { success, output: stdout.slice(-2000), errors }
            };
        } catch (err) {
            const error = err as Error & { stdout?: string };
            return {
                content: [{ type: 'text', text: `Build error: ${error.message}` }],
                structuredContent: { success: false, output: error.stdout || error.message, errors: [error.message] },
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: run_swift_tests
// Run Swift tests
// ============================================================================
server.registerTool(
    'run_swift_tests',
    {
        title: 'Run Swift Tests',
        description: 'Run Swift tests using xcodebuild test. Returns test results.',
        inputSchema: {
            workspace: z.string().optional().describe('Path to Xcode project workspace'),
            scheme: z.string().optional().describe('Xcode scheme to test'),
            testPlan: z.string().optional().describe('Test plan to run'),
            destination: z.string().optional().describe('Test destination (simulator UDID)')
        },
        outputSchema: {
            success: z.boolean(),
            passed: z.number(),
            failed: z.number(),
            output: z.string()
        }
    },
    async ({ workspace, scheme, testPlan, destination }) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const workspaceRoot = getWorkspace(workspace);
        
        let cmd = 'xcodebuild test';
        if (scheme) cmd += ` -scheme "${scheme}"`;
        if (testPlan) cmd += ` -testPlan "${testPlan}"`;
        if (destination) cmd += ` -destination "id=${destination}"`;
        cmd += ' 2>&1 | tail -100';
        
        try {
            const { stdout } = await execAsync(cmd, {
                cwd: workspaceRoot,
                timeout: 600000,
                maxBuffer: 1024 * 1024 * 50,
                env: SHELL_ENV
            });
            
            const success = stdout.includes('TEST SUCCEEDED') || stdout.includes('** TEST SUCCEEDED **');
            const passedMatch = stdout.match(/(\d+) tests? passed/);
            const failedMatch = stdout.match(/(\d+) tests? failed/);
            
            return {
                content: [{ type: 'text', text: success ? '✅ Tests passed' : '❌ Tests failed' }],
                structuredContent: { 
                    success, 
                    passed: passedMatch ? parseInt(passedMatch[1]) : 0,
                    failed: failedMatch ? parseInt(failedMatch[1]) : 0,
                    output: stdout.slice(-3000)
                }
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Test error: ${error.message}` }],
                structuredContent: { success: false, passed: 0, failed: 0, output: error.message },
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: open_simulator
// Boot a specific iOS Simulator
// ============================================================================
server.registerTool(
    'open_simulator',
    {
        title: 'Open iOS Simulator',
        description: 'Boot and open a specific iOS Simulator by UDID or name.',
        inputSchema: {
            identifier: z.string().describe('Simulator UDID or name (e.g., "iPhone 16 Pro")')
        },
        outputSchema: {
            success: z.boolean(),
            udid: z.string().optional(),
            message: z.string()
        }
    },
    async ({ identifier }) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
            // Try to boot the simulator
            await execAsync(`xcrun simctl boot "${identifier}" 2>/dev/null || true`);
            // Open Simulator.app
            await execAsync('open -a Simulator');
            
            return {
                content: [{ type: 'text', text: `✅ Simulator "${identifier}" is now booting` }],
                structuredContent: { success: true, udid: identifier, message: 'Simulator booted' }
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Error: ${error.message}` }],
                structuredContent: { success: false, message: error.message },
                isError: true
            };
        }
    }
);

// ============================================================================
// TOOL: request_handoff
// Multi-agent orchestration - suggest handoff to another agent
// ============================================================================
server.registerTool(
    'request_handoff',
    {
        title: 'Request Agent Handoff',
        description: 'Request a handoff to another specialized agent. Returns the target agent persona and handoff context.',
        inputSchema: {
            fromAgent: z.string().describe('Current agent name'),
            toAgent: z.string().describe('Target agent name (e.g., "tca-engineer", "swift-test-creator")'),
            reason: z.string().describe('Why the handoff is needed'),
            context: z.object({
                planFile: z.string().optional(),
                completedTasks: z.array(z.string()).optional(),
                nextSteps: z.array(z.string()).optional()
            }).optional()
        },
        outputSchema: {
            approved: z.boolean(),
            targetAgent: z.string(),
            agentContent: z.string(),
            handoffMessage: z.string()
        }
    },
    async ({ fromAgent, toAgent, reason, context }) => {
        try {
            const agentPath = join(AGENTS_DIR, `${toAgent}.md`);
            const agentContent = await readFile(agentPath, 'utf-8');
            const { body } = await parseAgentFrontmatter(agentContent);
            
            const handoffMessage = `
## Agent Handoff: ${fromAgent} → ${toAgent}

**Reason:** ${reason}

${context?.planFile ? `**Plan File:** ${context.planFile}` : ''}
${context?.completedTasks?.length ? `**Completed:** ${context.completedTasks.join(', ')}` : ''}
${context?.nextSteps?.length ? `**Next Steps:** ${context.nextSteps.join(', ')}` : ''}

---

**Now operating as @${toAgent}:**

${body}
`;
            
            return {
                content: [{ type: 'text', text: handoffMessage }],
                structuredContent: { 
                    approved: true, 
                    targetAgent: toAgent, 
                    agentContent: body,
                    handoffMessage 
                }
            };
        } catch (err) {
            const error = err as Error;
            return {
                content: [{ type: 'text', text: `Handoff failed: Agent "${toAgent}" not found. Available: swift-architect, tca-architect, tca-engineer, swift-engineer, swiftui-specialist, swift-test-creator, swift-code-reviewer, swift-ui-design, swift-modernizer, swift-documenter, documentation-generator, search` }],
                structuredContent: { 
                    approved: false, 
                    targetAgent: toAgent, 
                    agentContent: '',
                    handoffMessage: error.message 
                },
                isError: true
            };
        }
    }
);

// ============================================================================
// PROMPT REGISTRATION
// Dynamically register all agents and commands as MCP prompts
// ============================================================================

const PROMPTS_DIR = join(SWIFTAGENT_ROOT, '.github', 'prompts');

interface AgentMeta {
    name: string;
    description: string;
    content: string;
}

async function parseAgentFrontmatter(content: string): Promise<{ description: string; body: string }> {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
        return { description: 'Swift engineering agent', body: content };
    }
    
    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];
    const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);
    const description = descMatch ? descMatch[1].trim() : 'Swift engineering agent';
    
    return { description, body };
}

async function registerAgentPrompts(): Promise<void> {
    try {
        // Register agent prompts
        const agentFiles = await readdir(AGENTS_DIR);
        for (const file of agentFiles.filter(f => f.endsWith('.md'))) {
            const agentName = file.replace('.md', '');
            const content = await readFile(join(AGENTS_DIR, file), 'utf-8');
            const { description, body } = await parseAgentFrontmatter(content);
            
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
                            text: task ? `${body}\n\n---\n\n**Your task:** ${task}` : body
                        }
                    }]
                })
            );
        }
        
        // Register command prompts (snapshot, resume, reflect)
        try {
            const promptFiles = await readdir(PROMPTS_DIR);
            for (const file of promptFiles.filter(f => f.endsWith('.prompt.md'))) {
                const promptName = file.replace('.prompt.md', '');
                const content = await readFile(join(PROMPTS_DIR, file), 'utf-8');
                const { description, body } = await parseAgentFrontmatter(content);
                
                server.registerPrompt(
                    promptName,
                    {
                        title: promptName.charAt(0).toUpperCase() + promptName.slice(1),
                        description: description,
                        argsSchema: {}
                    },
                    () => ({
                        messages: [{
                            role: 'user',
                            content: { type: 'text', text: body }
                        }]
                    })
                );
            }
        } catch {
            // Prompts directory might not exist
        }
    } catch (err) {
        console.error('Error registering prompts:', err);
    }
}

// ============================================================================
// Start the server with stdio transport
// ============================================================================
async function main() {
    await registerAgentPrompts();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('SwiftAgent MCP Server started (9 tools, 15 prompts)');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
