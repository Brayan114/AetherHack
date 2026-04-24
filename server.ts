import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Wraith } from './src/agents/Wraith';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { NeuralLinkAdapter, NeuralSettings } from './src/agents/NeuralLinkAdapter';
import { KnowledgeVault } from './src/agents/KnowledgeVault';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const wraith = new Wraith();
const LOOT_FILE = path.join(__dirname, 'loot.json');

interface LootConfig {
    ip: string;
    service: string;
    username: string;
    password: string;
    timestamp: string;
}

async function loadLoot(): Promise<LootConfig[]> {
    if (!existsSync(LOOT_FILE)) return [];
    try {
        const data = await fs.readFile(LOOT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function saveLoot(newLootItems: LootConfig[]) {
    const existing = await loadLoot();
    const combined = [...existing, ...newLootItems];
    await fs.writeFile(LOOT_FILE, JSON.stringify(combined, null, 2), 'utf8');
    io.emit('loot-updated', combined);
}

let sessionHistory: string[] = [];

async function processAgentTask(socket: any, settings: NeuralSettings) {
    try {
        // Enforce safe memory boundary to prevent absolute memory heap crashes on Node
        if (sessionHistory.length > 50) {
            sessionHistory.splice(0, sessionHistory.length - 50);
        }

        console.log(`[Architect] Loading autonomous agent reasoning protocols...`);
        
        const skillPath = path.join(__dirname, 'skills', 'autonomous_agent', 'SKILL.md');
        let skillInstructions = '';
        if (existsSync(skillPath)) {
            skillInstructions = await fs.readFile(skillPath, 'utf8');
        }

        const historyDump = sessionHistory.map((item, idx) => `${item}`).join('\n\n');
        
        // Initialize Knowledge Vault (Uses Gemini API key from settings or .env)
        const geminiKey = settings.provider === 'gemini' && settings.apiKey ? settings.apiKey : process.env.GOOGLE_API_KEY;
        let vaultInjection = '';
        if (geminiKey) {
            await KnowledgeVault.initialize(geminiKey);
            const latestContext = sessionHistory.length > 0 ? sessionHistory[sessionHistory.length - 1] : "Initial analysis request";
            const vaultRecall = await KnowledgeVault.query(latestContext, 3);
            if (vaultRecall) {
                console.log(`[Architect] RAG Pipeline triggered. Injected ${vaultRecall.length} bytes of cheat sheet context.`);
                vaultInjection = `\n[ KNOWLEDGE VAULT RETRIEVAL ]\nThe following advanced techniques from the AetherHack Vault match the current situation closely. Use these exact methodologies or payloads if relevant:\n\n${vaultRecall}\n`;
            }
        }
        
        const prompt = `System Protocol Definition:\n${skillInstructions}\n${vaultInjection}\nSession Memory & Command History:\n${historyDump}\n\nBased on the history and instructions, formulate your next response.`;

        const fullOutputBuffer = await NeuralLinkAdapter.streamAnalysis(prompt, settings, (chunk) => {
            socket.emit('agent-analysis', chunk);
        });

        sessionHistory.push(`Architect: ${fullOutputBuffer}`);

        // Simple Regex for backward compatibility just in case it leaks
        const lootRegex = /\[\+\] CAPTURED_LOOT:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\n]+)/g;
        let match;
        const extractedLoot: LootConfig[] = [];

        while ((match = lootRegex.exec(fullOutputBuffer)) !== null) {
            extractedLoot.push({
                ip: match[1].trim(),
                service: match[2].trim(),
                username: match[3].trim(),
                password: match[4].trim(),
                timestamp: new Date().toISOString()
            });
        }

        if (extractedLoot.length > 0) {
            console.log(`[Architect] Vault Sequence Triggered: Extracted ${extractedLoot.length} loot records.`);
            await saveLoot(extractedLoot);
        }

    } catch (error) {
        console.error(`[Architect] Reasoning Pipeline Error:`, error);
        socket.emit('scan-error', { error: `Neural link disrupted: ${String(error)}` });
    }
}

io.on('connection', async (socket) => {
    console.log(`[Architect] UI Connected: ${socket.id}`);

    try {
        const existingLoot = await loadLoot();
        socket.emit('loot-updated', existingLoot);
    } catch {}

    socket.on('run-agent', async (data?: { prompt?: string, settings?: NeuralSettings }) => {
        const prompt = data?.prompt || '';
        const settings = data?.settings || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' } as NeuralSettings;
        console.log(`[Architect] Received natural language task: ${prompt}`);
        
        try {
            socket.emit('scan-status', { status: 'running' });
            sessionHistory.push(`User: ${prompt}`);
            await processAgentTask(socket, settings);
            socket.emit('scan-status', { status: 'complete' });
        } catch (error) {
            console.error(`[Architect] Agent reasoning error:`, error);
            socket.emit('scan-error', { error: String(error) });
        }
    });

    socket.on('stdin-input', (data: { input: string }) => {
        wraith.writeStdin(data.input);
    });

    socket.on('run-command', async (data?: { command?: string, settings?: NeuralSettings }) => {
        let commandStr = data?.command || '';
        const settings = data?.settings || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' } as NeuralSettings;
        console.log(`[Architect] Received terminal input: ${commandStr}`);
        
        try {
            const commonTools = [
                'nmap', 'curl', 'hydra', 'nikto', 'web', 'recon', 'ssh', 'ftp', 'ping', 'sqlmap', 
                'gobuster', 'dirb', 'cat', 'ls', 'wget', 'echo', 'python', 'python3', 'nc', 'netcat', 
                'ncat', 'smbclient', 'enum4linux', 'dig', 'nslookup', 'host', 'whois', 'ffuf', 'wfuzz', 
                'smbmap', 'john', 'hashcat', 'socat', 'telnet', 'sh', 'bash', 'sudo', 'apt', 'apt-get', 
                'dpkg', 'grep', 'awk', 'sed', 'git', 'chmod', 'chown', 'mkdir', 'rm', 'mv', 'cp', 
                'touch', 'nano', 'vim', 'which', 'whereis', 'find', 'systemctl', 'service', 'su', 
                'id', 'whoami', 'pwd', 'export', 'env', 'source'
            ];
            
            let baseCommand = commandStr.trim().split(/\s+/)[0].toLowerCase();
            if (baseCommand === 'sudo') {
                const parts = commandStr.trim().split(/\s+/);
                if (parts.length > 1) {
                    baseCommand = parts[1].toLowerCase();
                }
            }

            if (!commonTools.includes(baseCommand) && !commandStr.includes('./') && !commandStr.includes('/')) {
                console.log(`[Architect] Routing '${commandStr}' as Natural Language Instruction.`);
                socket.emit('scan-status', { status: 'running' });
                socket.emit('agent-analysis', `\n[SYSTEM] Diverting raw text to Neural Engine...\n`);
                sessionHistory.push(`User: ${commandStr}`);
                await processAgentTask(socket, settings);
                socket.emit('scan-status', { status: 'complete' });
                return;
            }

            socket.emit('scan-status', { status: 'running' });
            
            const rawOutput = await wraith.executeInSandbox(commandStr.split(' '), (chunk) => {
                socket.emit('scan-data', chunk);
            });
            let processedOutput = rawOutput;
            if (processedOutput.length > 60000) {
                processedOutput = `...[SYSTEM CAP: EXTREME LOG LENGTH - TRUNCATED]...\n` + processedOutput.slice(-60000);
            }
            
            sessionHistory.push(`Terminal Execution Output:\nCommand: ${commandStr}\nOutput:\n${processedOutput}`);
            
            // Loop step back to LLM to make sense of output
            await processAgentTask(socket, settings);
            
            socket.emit('scan-status', { status: 'complete' });
        } catch (error) {
            console.error(`[Architect] Command execution error:`, error);
            
            let processedError = String(error);
            if (processedError.length > 60000) {
                processedError = `...[SYSTEM CAP: EXTREME LOG LENGTH - TRUNCATED]...\n` + processedError.slice(-60000);
            }
            
            sessionHistory.push(`Terminal Error Output:\nCommand: ${commandStr}\nError:\n${processedError}`);
            await processAgentTask(socket, settings);
            socket.emit('scan-error', { error: String(error) });
            socket.emit('scan-status', { status: 'error' });
        }
    });

    socket.on('reset-memory', () => {
        sessionHistory = [];
        socket.emit('agent-analysis', `\n[SYSTEM] Session memory purged.\n`);
    });

    socket.on('pull-memory', () => {
        const memDump = sessionHistory.join('\n');
        socket.emit('agent-analysis', `\n[MIND_DUMP]\n${memDump}\n`);
    });

    socket.on('disconnect', () => {
        console.log(`[Architect] UI Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`[Architect] Server listening on port ${PORT}`);
});
