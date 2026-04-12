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

async function processAnalysis(socket: any, rawOutput: string, skillName: string, settings: NeuralSettings, extraInstructions: string = '') {
    try {
        console.log(`[Architect] Loading reasoning protocols for: ${skillName}`);
        
        const skillPath = path.join(__dirname, 'skills', skillName, 'SKILL.md');
        const skillInstructions = await fs.readFile(skillPath, 'utf8');

        const prompt = `System Protocol Definition:\n${skillInstructions}\n\n${extraInstructions}\n\nNative Terminal Output Dump:\n${rawOutput}\n\nExecute processing directive based strictly on the provided System Protocol. Respond EXCLUSIVELY in the tactical format defined within the protocol.\n\nCRITICAL NEW INSTRUCTION 1: At the very end of your response, you MUST provide a logical next command based on your findings (e.g., if you found a web server on port 80, suggest 'web http://<target>'). Format this EXACTLY as:\n[?] SUGGESTED_COMMAND: <your command here>\n\nCRITICAL NEW INSTRUCTION 2: If you discover any credentials, usernames, tokens, or passwords, you MUST output them exactly in the following format so the system can database them:\n[+] CAPTURED_LOOT: <IP>|<SERVICE>|<USERNAME>|<PASSWORD>\n(If an IP/Target is unknown, use 'Target' or infer it).\n\nDo not use conversational openings. Formulate exactly as The Wraith.`;

        socket.emit('agent-analysis', `\n[SYSTEM] Neural link established via ${settings.provider.toUpperCase()}. Commencing Post-Command Analysis...\n`);

        const fullOutputBuffer = await NeuralLinkAdapter.streamAnalysis(prompt, settings, (chunk) => {
            socket.emit('agent-analysis', chunk);
        });

        socket.emit('agent-analysis', '\n[SYSTEM] Analysis complete.\n\n');

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

    socket.on('run-scan', async (data?: { target?: string, settings?: NeuralSettings }) => {
        const target = data?.target || '127.0.0.1';
        const settings = data?.settings || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' } as NeuralSettings;
        console.log(`[Architect] Received run-scan directive for target: ${target}. Initiating Shadow Recon pipeline.`);
        
        try {
            socket.emit('scan-status', { status: 'running' });
            
            const rawOutput = await wraith.executeInSandbox(['nmap', '-sV', '-Pn', '--top-ports', '1000', target], (chunk) => {
                socket.emit('scan-data', chunk);
            });
            
            await processAnalysis(socket, rawOutput, 'shadow_recon', settings);
            
            socket.emit('scan-status', { status: 'complete' });
        } catch (error) {
            console.error(`[Architect] Target execution error system:`, error);
            socket.emit('scan-error', { error: String(error) });
            socket.emit('scan-status', { status: 'error' });
        }
    });

    socket.on('run-web-audit', async (data?: { target?: string, settings?: NeuralSettings }) => {
        const target = data?.target || 'http://127.0.0.1';
        const settings = data?.settings || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' } as NeuralSettings;
        console.log(`[Architect] Received run-web-audit directive for target: ${target}. Initiating Web Protocol.`);
        
        try {
            socket.emit('scan-status', { status: 'running' });
            
            const rawOutput = await wraith.executeInSandbox(['curl', '-s', target], (chunk) => {
                socket.emit('scan-data', chunk);
            });
            
            await processAnalysis(
                socket, 
                rawOutput, 
                'logic_leaker', 
                settings,
                'GOAL CONSTRAINT: Specifically look for "ingredients", "usernames", or "passwords" hidden in the HTML comments or text. Treat the raw output as HTML source code.'
            );
            
            socket.emit('scan-status', { status: 'complete' });
        } catch (error) {
            console.error(`[Architect] Web audit execution error system:`, error);
            socket.emit('scan-error', { error: String(error) });
            socket.emit('scan-status', { status: 'error' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Architect] UI Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`[Architect] Server listening on port ${PORT}`);
});
