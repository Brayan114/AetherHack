import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';

const BOOT_SEQUENCE = [
    "Initializing Orbit Studios Kernel...",
    "Mounting AetherHack.OS virtual filesystems... [OK]",
    "Establishing secure WebSockets link... [OK]",
    "Executing Architect Interface...",
    "",
    "   ____       __    _ __     _____ __            ___          ",
    "  / __ \\_____/ /_  (_) /_   / ___// /___  ______/ (_)___  _____",
    " / / / / ___/ __ \\/ / __/   \\__ \\/ __/ / / / __  / / __ \\/ ___/",
    "/ /_/ / /  / /_/ / / /_    ___/ / /_/ /_/ / /_/ / / /_/ (__  ) ",
    "\\____/_/  /_.___/_/\\__/   /____/\\__/\\__,_/\\__,_/_/\\____/____/  ",
    "",
    "Welcome to AetherHack.OS v1.0. All systems online.",
    "Type 'recon' to initiate Shadow Protocol."
];

type LineType = 'system' | 'raw' | 'analysis' | 'error' | 'user_chat';
interface TerminalLine {
    type: LineType;
    text: string;
}

interface LootData {
    ip: string;
    service: string;
    username: string;
    password: string;
    timestamp: string;
}

interface NeuralSettingsData {
    provider: 'gemini' | 'openai' | 'ollama' | 'anthropic' | 'mistral' | 'perplexity' | 'groq' | 'custom';
    apiKey: string;
    baseUrl: string;
    model: string;
}

export const Terminal: React.FC = () => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [input, setInput] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [booted, setBooted] = useState(false);
    const [isInteractivePrompt, setIsInteractivePrompt] = useState(false);
    
    // Modes
    type OperatingMode = 'manual' | 'semi' | 'hunt';
    const [operatingMode, setOperatingMode] = useState<OperatingMode>('manual');
    const operatingModeRef = useRef<OperatingMode>('manual');
    
    const lastInjectedRef = useRef<string | null>(null);

    // Vault & Settings State
    const [vaultOpen, setVaultOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [vaultLoot, setVaultLoot] = useState<LootData[]>([]);

    const [neural, setNeural] = useState<NeuralSettingsData>(() => {
        const saved = localStorage.getItem('aetherhack_neural_settings');
        return saved ? JSON.parse(saved) : {
            provider: 'gemini',
            apiKey: '',
            baseUrl: '',
            model: 'gemini-2.5-flash'
        };
    });

    const socketRef = useRef<Socket | null>(null);
    const leftScrollRef = useRef<HTMLDivElement>(null);
    const rightScrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keep ref in sync for timeouts
    useEffect(() => {
        operatingModeRef.current = operatingMode;
        if (operatingMode === 'manual') {
            setIsScanning(false);
            if (inputRef.current) inputRef.current.focus();
        }
    }, [operatingMode]);

    useEffect(() => {
        localStorage.setItem('aetherhack_neural_settings', JSON.stringify(neural));
    }, [neural]);

    // Dynamic Matrix Boot Sequence
    useEffect(() => {
        let currentLine = 0;
        const interval = setInterval(() => {
            if (currentLine < BOOT_SEQUENCE.length) {
                setLines(prev => {
                    if (prev.length > currentLine) return prev;
                    return [...prev, { type: 'system', text: BOOT_SEQUENCE[currentLine] }];
                });
                currentLine++;
            } else {
                clearInterval(interval);
                setBooted(true);
            }
        }, 120);

        return () => clearInterval(interval);
    }, []);

    // WebSocket Logic
    useEffect(() => {
        if (!booted) return;

        const socket = io('ws://localhost:3000');
        socketRef.current = socket;

        socket.on('connect', () => {
            setLines(prev => [...prev, { type: 'system', text: '[SYSTEM] Connected to The Architect (ws://localhost:3000).' }]);
        });

        socket.on('scan-data', (chunk: string) => {
            if (/(password for|\[sudo\]|Password:)/i.test(chunk)) {
                setIsInteractivePrompt(true);
            }
            setLines(prev => {
                const newLines = [...prev];
                const lastIndex = newLines.length - 1;
                if (lastIndex >= 0 && newLines[lastIndex].type === 'raw') {
                    newLines[lastIndex] = { ...newLines[lastIndex], text: newLines[lastIndex].text + chunk };
                } else {
                    newLines.push({ type: 'raw', text: chunk });
                }
                return newLines;
            });
        });

        socket.on('agent-analysis', (chunk: string) => {
            setLines(prev => {
                const newLines = [...prev];
                const lastIndex = newLines.length - 1;
                if (lastIndex >= 0 && newLines[lastIndex].type === 'analysis') {
                    newLines[lastIndex] = { ...newLines[lastIndex], text: newLines[lastIndex].text + chunk };
                } else {
                    newLines.push({ type: 'analysis', text: chunk });
                }
                return newLines;
            });
        });

        socket.on('scan-status', (data: { status: string }) => {
            if (data.status === 'running') {
                setIsScanning(true);
                setIsInteractivePrompt(false);
            } else {
                setIsScanning(false);
                setIsInteractivePrompt(false);
                setLines(prev => [...prev, { type: 'system', text: '[SYSTEM] Protocol Sequence Complete.' }]);
            }
        });

        socket.on('scan-error', (data) => {
            setIsScanning(false);
            setIsInteractivePrompt(false);
            setLines(prev => [...prev, { type: 'error', text: `[ERROR] ${data.error}` }]);
            
            // Loop Protection: Disable Autonomy on failure
            setOperatingMode('manual');
            setLines(prev => [...prev, { type: 'error', text: `[SYSTEM OVERRIDE] Fatal error detected. Autonomous execution aborted. Reverting to MANUAL override.` }]);
        });

        socket.on('loot-updated', (lootData: LootData[]) => {
            setVaultLoot(lootData);
        });

        return () => {
            socket.disconnect();
        };
    }, [booted]);

    // Auto-scroll handler
    useEffect(() => {
        leftScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        rightScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines, input, chatInput]);

    const pendingExecutionRef = useRef(false);

    // Auto-Injector for Semi & Hunt Modes
    useEffect(() => {
        if ((operatingMode === 'semi' || operatingMode === 'hunt') && !isScanning && !pendingExecutionRef.current && lines.length > 0) {
            const lastLine = [...lines].reverse().find(l => l.type === 'analysis');
            if (lastLine) {
                const match = lastLine.text.match(/```bash\s*([\s\S]+?)\s*```/);
                if (match && lastInjectedRef.current !== match[1].trim()) {
                    const cmd = match[1].trim();
                    setInput(cmd);
                    lastInjectedRef.current = cmd;
                    pendingExecutionRef.current = true;

                    // Fully Autonomous Trigger
                    if (operatingMode === 'hunt') {
                        setLines(prev => [...prev, { type: 'system', text: `[AUTONOMY] Executing tactical directive in 2 seconds...` }]);
                        setTimeout(() => {
                            if (operatingModeRef.current === 'hunt') {
                                executeCommand(cmd);
                                setInput('');
                            } else {
                                setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Directive cancelled. Operator override detected.` }]);
                                pendingExecutionRef.current = false;
                            }
                        }, 2000);
                    } else {
                        pendingExecutionRef.current = false;
                    }
                } else if (match && lastInjectedRef.current === match[1].trim()) {
                    if (!pendingExecutionRef.current) {
                        setLines(prev => {
                            if (prev.length > 0 && prev[prev.length - 1].text.includes('Infinite Loop Prevention')) return prev;
                            return [...prev, { type: 'error', text: `[SYSTEM OVERRIDE] Infinite Loop Prevention: AI suggested identical consecutive command. Halting autonomy.` }];
                        });
                        pendingExecutionRef.current = true;
                    }
                }
            }
        }
    }, [lines, isScanning, operatingMode]);

    const executeCommand = (rawInput: string) => {
        pendingExecutionRef.current = false;
        if (!rawInput) return;

        setLines(prev => [...prev, { type: 'system', text: `> ${rawInput}` }]);

        const parts = rawInput.split(/\s+/);
        let baseCommand = parts[0].toLowerCase();
        if (baseCommand === 'sudo' && parts.length > 1) {
            baseCommand = parts[1].toLowerCase();
        }
        
        let target = '127.0.0.1';
        const potentialTarget = parts.find(p => p.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/) || p.startsWith('http'));
        if (potentialTarget) target = potentialTarget;
        else if (parts.length > 1) target = parts[parts.length - 1]; // Assume last arg is target if no regex match

        if (baseCommand === 'mode' && (target === 'manual' || target === 'semi' || target === 'hunt')) {
            setOperatingMode(target as OperatingMode);
            setIsScanning(false);
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Tactical Mode Engaged: [${target.toUpperCase()}]` }]);
            if (target === 'manual') {
                setInput('');
                lastInjectedRef.current = null;
            }
        } else if (baseCommand === 'clear') {
            setLines([]);
        } else if (baseCommand === 'reset') {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Purging Neural Link memory banks...` }]);
            socketRef.current?.emit('reset-memory');
        } else if (baseCommand === 'memory') {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Extracting active session memory...` }]);
            socketRef.current?.emit('pull-memory');
        } else if (baseCommand === 'agent') {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Forwarding natural language protocol to Autonomous Agent...` }]);
            setIsScanning(true);
            socketRef.current?.emit('run-agent', { prompt: rawInput.replace(/^agent\s+/i, ''), settings: neural });
        } else {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Executing raw terminal directive...` }]);
            setIsScanning(true);
            socketRef.current?.emit('run-command', { command: rawInput, settings: neural });
        }
    };

    const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (booted && !settingsOpen) {
            if (e.key === 'Enter') {
                if (isInteractivePrompt) {
                    socketRef.current?.emit('stdin-input', { input: input });
                    setIsInteractivePrompt(false);
                    setInput('');
                    setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Authorization token transmitting...` }]);
                } else {
                    executeCommand(input.trim());
                    setInput('');
                }
            } else if (e.key === ' ' && (operatingMode === 'semi' || operatingMode === 'hunt') && input.trim().length > 0 && input === lastInjectedRef.current) {
                e.preventDefault();
                if (!isInteractivePrompt) {
                    executeCommand(input.trim());
                    setInput('');
                }
            }
        }
    };

    const handleChatCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (booted && !settingsOpen && !isScanning && e.key === 'Enter') {
            if (chatInput.trim() !== '') {
                setLines(prev => [...prev, { type: 'user_chat', text: chatInput.trim() }]);
                setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Forwarding natural language protocol to Architect: "${chatInput.trim()}"` }]);
                setIsScanning(true);
                socketRef.current?.emit('run-agent', { prompt: chatInput.trim(), settings: neural });
                setChatInput('');
            }
        }
    };

    const getLineStyle = (type: LineType) => {
        switch (type) {
            case 'analysis':
                return { color: '#00ff88', textShadow: '0 0 5px #00ff88', fontWeight: 'bold' };
            case 'error':
                return { color: '#ff003c' }; 
            case 'raw':
                return { color: '#00ff41', opacity: 0.8 }; 
            case 'system':
            default:
                return { color: '#00ff41' }; 
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'row', backgroundColor: '#000' }}>
            
            {/* Settings Overlay Modal */}
            {settingsOpen && (
                <div style={{
                    position: 'absolute',
                    top: '50%', right: '50%', transform: 'translate(50%, -50%)',
                    width: '400px', backgroundColor: '#0f0f11', border: '1px solid #00ff88',
                    padding: '30px', zIndex: 2000, color: '#00ff41',
                    fontFamily: '"Fira Code", monospace',
                    boxShadow: '0 0 50px rgba(0,255,136,0.1)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '10px', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0 }}>// NEURAL LINK CONFIG</h3>
                        <button onClick={() => setSettingsOpen(false)} style={{ background: 'transparent', color: '#ff003c', border: 'none', cursor: 'pointer', fontFamily: '"Fira Code", monospace', fontSize: '1.2em' }}>[ X ]</button>
                    </div>
                    
                    <label style={{ display: 'block', marginTop: '15px' }}>Provider:</label>
                    <select 
                        value={neural.provider} 
                        onChange={(e) => setNeural({...neural, provider: e.target.value as any})}
                        style={{ width: '100%', padding: '8px', background: '#0a0a0a', color: '#00ff88', border: '1px solid #333', outline: 'none' }}
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="mistral">Mistral AI</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="perplexity">Perplexity</option>
                        <option value="ollama">Local (Ollama)</option>
                        <option value="groq">Groq</option>
                        <option value="custom">Custom REST Endpoint</option>
                    </select>

                    <label style={{ display: 'block', marginTop: '15px' }}>API Key (Saved Locally):</label>
                    <input 
                        type="password" 
                        value={neural.apiKey}
                        onChange={(e) => setNeural({...neural, apiKey: e.target.value})}
                        style={{ width: '100%', padding: '8px', background: '#0a0a0a', color: '#00ff88', border: '1px solid #333', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="Neural Access Token..."
                    />

                    <label style={{ display: 'block', marginTop: '15px' }}>Base URL (If Override Needed):</label>
                    <input 
                        type="text" 
                        value={neural.baseUrl}
                        onChange={(e) => setNeural({...neural, baseUrl: e.target.value})}
                        style={{ width: '100%', padding: '8px', background: '#0a0a0a', color: '#00ff88', border: '1px solid #333', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="http://127.0.0.1:11434"
                    />

                    <label style={{ display: 'block', marginTop: '15px' }}>Model Name:</label>
                    <input 
                        type="text" 
                        value={neural.model}
                        onChange={(e) => setNeural({...neural, model: e.target.value})}
                        style={{ width: '100%', padding: '8px', background: '#0a0a0a', color: '#00ff88', border: '1px solid #333', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="gemini-2.5-flash / llama3"
                    />

                    <button 
                        onClick={() => setSettingsOpen(false)}
                        style={{
                            display: 'block', width: '100%', marginTop: '25px', padding: '10px',
                            background: '#00ff88', color: '#0a0a0a', border: 'none', fontWeight: 'bold', cursor: 'pointer'
                        }}
                    >
                        [ INITIALIZE LINK ]
                    </button>
                </div>
            )}

            {/* Flex Container for Split Pane */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>

                {/* Left Pane - Main Terminal (70%) */}
                <div style={{
                    flex: '0.7',
                    backgroundColor: '#0a0a0a',
                    color: '#00ff41',
                    fontFamily: '"Fira Code", monospace',
                    padding: '20px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s ease-in-out',
                    boxSizing: 'border-box',
                    borderRight: '2px solid rgba(0, 255, 65, 0.3)',
                    boxShadow: operatingMode === 'hunt' ? 'inset 0 0 30px rgba(255, 0, 60, 0.4)' : 'none',
                    animation: operatingMode === 'hunt' ? 'huntPulse 2s infinite' : 'none',
                    filter: settingsOpen ? 'brightness(0.2)' : 'none'
                }}>
                    {/* Header Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', zIndex: 1000 }}>
                        {/* Tactical Mode Toggle Panel */}
                        <div style={{ display: 'flex', border: '1px solid #333', backgroundColor: '#111' }}>
                            <button 
                                onClick={() => { setOperatingMode('manual'); setLines(p => [...p, {type: 'system', text: '[SYSTEM] Tactical Mode Engaged: [MANUAL]'}]); }}
                                style={{ padding: '8px 12px', background: operatingMode === 'manual' ? '#00ff41' : 'transparent', color: operatingMode === 'manual' ? '#0a0a0a' : '#00ff41', border: 'none', cursor: 'pointer', fontFamily: '"Fira Code", monospace', fontWeight: 'bold' }}
                            >MANUAL</button>
                            <button 
                                onClick={() => { setOperatingMode('semi'); setLines(p => [...p, {type: 'system', text: '[SYSTEM] Tactical Mode Engaged: [SEMI]'}]); }}
                                style={{ padding: '8px 12px', background: operatingMode === 'semi' ? '#00ff88' : 'transparent', color: operatingMode === 'semi' ? '#0a0a0a' : '#00ff88', border: 'none', borderLeft: '1px solid #333', cursor: 'pointer', fontFamily: '"Fira Code", monospace', fontWeight: 'bold' }}
                            >SEMI</button>
                            <button 
                                onClick={() => { setOperatingMode('hunt'); setLines(p => [...p, {type: 'system', text: '[SYSTEM] Tactical Mode Engaged: [HUNT]'}]); }}
                                style={{ padding: '8px 12px', background: operatingMode === 'hunt' ? '#ff003c' : 'transparent', color: operatingMode === 'hunt' ? '#0a0a0a' : '#ff003c', border: 'none', borderLeft: '1px solid #333', cursor: 'pointer', fontFamily: '"Fira Code", monospace', fontWeight: 'bold' }}
                            >HUNT</button>
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginRight: vaultOpen ? '420px' : '0px', transition: 'margin-right 0.3s ease' }}>
                            <button
                                onClick={() => setSettingsOpen(true)}
                                style={{
                                    backgroundColor: '#111', color: '#00ff88', border: '1px solid #00ff88',
                                    padding: '8px 16px', cursor: 'pointer', fontFamily: '"Fira Code", monospace',
                                }}
                            >
                                [ ⚙️ SETTINGS ]
                            </button>
                            <button
                                onClick={() => setVaultOpen(!vaultOpen)}
                                style={{
                                    backgroundColor: '#111', color: vaultOpen ? '#ff003c' : '#00ff88',
                                    border: `1px solid ${vaultOpen ? '#ff003c' : '#00ff88'}`, padding: '8px 16px',
                                    cursor: 'pointer', fontFamily: '"Fira Code", monospace', transition: 'background-color 0.2s',
                                }}
                            >
                                {vaultOpen ? '[ CLOSE VAULT ]' : `[ OPEN VAULT (${vaultLoot.length}) ]`}
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        {lines.filter(l => l.type !== 'analysis').map((line, idx) => (
                            <div key={idx} style={{ padding: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', ...getLineStyle(line.type) }}>
                                {line.text}
                            </div>
                        ))}
                        <div ref={leftScrollRef} />
                    </div>

                    {booted && (!isScanning || isInteractivePrompt) && (
                        <div style={{ display: 'flex', marginTop: '10px' }}>
                            <span style={{ marginRight: '10px', color: operatingMode === 'hunt' ? '#ff003c' : '#00ff41' }}>root@NODE_729:~$</span>
                            <input
                                ref={inputRef}
                                type={isInteractivePrompt ? "password" : "text"}
                                placeholder={isInteractivePrompt ? "AWAITING AUTHORIZATION..." : ""}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleCommand}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: (operatingMode === 'hunt' || operatingMode === 'semi') && input === lastInjectedRef.current ? '#00ff88' : '#00ff41',
                                    border: 'none', outline: 'none', flex: 1, fontFamily: '"Fira Code", monospace', fontSize: '1em',
                                    textShadow: operatingMode === 'hunt' ? '0 0 5px #ff003c' : 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                {/* Right Pane - Neural Link (30%) */}
                <div style={{
                    flex: '0.3',
                    backgroundColor: '#1c1b1b',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    boxSizing: 'border-box',
                    filter: settingsOpen ? 'brightness(0.2)' : 'none'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '40px', height: '40px', backgroundColor: '#3a3939', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #00ff41' }}>
                            <span style={{ color: '#00ff41', fontWeight: 'bold' }}>AI</span>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2em', color: '#efe500', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: '"Space Grotesk", sans-serif' }}>Architect</h2>
                            <p style={{ margin: 0, fontSize: '0.75em', color: '#00ff41', textTransform: 'uppercase', opacity: 0.8 }}>NEURAL_LINK_ESTABLISHED</p>
                        </div>
                    </div>

                    <h3 style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#00ff41', fontWeight: 'bold', borderBottom: '1px solid rgba(0,255,65,0.2)', paddingBottom: '8px', marginBottom: '16px' }}>Active Reasoning</h3>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {lines.filter(l => l.type === 'analysis' || l.type === 'user_chat').map((line, idx, arr) => {
                            const isLastMessage = idx === arr.length - 1;
                            if (line.type === 'user_chat') {
                                return (
                                    <div key={idx} style={{ 
                                        alignSelf: 'flex-end', backgroundColor: '#003907', border: '1px solid #00ff41',
                                        padding: '10px 15px', color: '#00ff41', fontFamily: '"Fira Code", monospace', 
                                        fontSize: '0.85em', borderRadius: '8px 8px 0 8px', maxWidth: '80%', wordBreak: 'break-word',
                                        boxShadow: '0 0 10px rgba(0,255,65,0.1)'
                                    }}>
                                        {line.text}
                                    </div>
                                );
                            }

                            return (
                                <div key={idx} style={{
                                    alignSelf: 'flex-start', backgroundColor: '#201f1f', padding: '15px', 
                                    border: '1px solid rgba(132, 150, 126, 0.3)', color: '#b9ccb2', 
                                    fontFamily: '"Fira Code", monospace', fontSize: '0.85em', lineHeight: '1.5',
                                    borderRadius: '8px 8px 8px 0', maxWidth: '95%', wordBreak: 'break-word',
                                    position: 'relative'
                                }}>
                                    <ReactMarkdown
                                        components={{
                                            code: ({ node, inline, className, children, ...props }: any) => {
                                                const match = /language-(\w+)/.exec(className || '');
                                                if (!inline && match && match[1] === 'bash') {
                                                    const cmdText = String(children).replace(/\n$/, '');
                                                    return (
                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(132,150,126,0.2)' }}>
                                                            <span style={{ color: '#00ff41', fontSize: '0.8em', display: 'block', marginBottom: '4px' }}>&#91; SUGGESTED COMMAND &#93;</span>
                                                            <pre style={{ background: '#0a0a0a', padding: '10px', overflowX: 'auto', color: '#fff', margin: 0, border: '1px solid #333' }}>
                                                                <code {...props}>{cmdText}</code>
                                                            </pre>
                                                            {!isScanning && (operatingMode === 'manual' || operatingMode === 'semi') && isLastMessage ? (
                                                                <button 
                                                                    onClick={() => executeCommand(cmdText)}
                                                                    style={{
                                                                        width: '100%', marginTop: '10px', backgroundColor: '#00ff41', color: '#003907',
                                                                        border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold',
                                                                        textTransform: 'uppercase', boxShadow: '0 0 10px rgba(0,255,65,0.2)',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    EXECUTE
                                                                </button>
                                                            ) : isScanning && isLastMessage ? (
                                                                <div style={{
                                                                    width: '100%', marginTop: '10px', backgroundColor: '#003907', color: '#00ff41',
                                                                    border: '1px solid #00ff41', padding: '8px', textAlign: 'center', fontWeight: 'bold',
                                                                    textTransform: 'uppercase', fontSize: '0.9em', boxSizing: 'border-box'
                                                                }}>
                                                                    [ EXECUTING PAYLOAD... ]
                                                                </div>
                                                            ) : (
                                                                <div style={{
                                                                    width: '100%', marginTop: '10px', backgroundColor: '#111', color: '#555',
                                                                    border: '1px solid #333', padding: '8px', textAlign: 'center', fontWeight: 'bold',
                                                                    textTransform: 'uppercase', fontSize: '0.9em', boxSizing: 'border-box'
                                                                }}>
                                                                    [ EXPIRED PAYLOAD ]
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return <code className={className} style={{ background: '#111', padding: '2px 4px', borderRadius: '4px', color: '#ffb86c' }} {...props}>{children}</code>;
                                            }
                                        }}
                                    >
                                        {line.text}
                                    </ReactMarkdown>
                                </div>
                            );
                        })}
                        <div ref={rightScrollRef} />
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(0,255,65,0.2)', paddingTop: '16px' }}>
                        <span style={{ color: '#00ff41', marginRight: '8px' }}>&gt;</span>
                        <input
                            type="text"
                            placeholder={isScanning ? "PROCESSING..." : "Message The Architect..."}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={handleChatCommand}
                            style={{
                                flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#00ff41',
                                fontFamily: '"Fira Code", monospace', fontSize: '0.85em'
                            }}
                            disabled={!booted || isScanning}
                        />
                    </div>
                </div>

            </div>



            {/* Tactical Loot Vault Sidebar */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: vaultOpen ? 0 : '-400px',
                width: '400px',
                height: '100vh',
                backgroundColor: '#0f0f11',
                borderLeft: '1px solid #00ff88',
                boxShadow: '-5px 0 25px rgba(0, 255, 136, 0.1)',
                transition: 'right 0.3s ease-in-out',
                zIndex: 900,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: '"Fira Code", monospace',
            }}>
                <div style={{ 
                    padding: '20px', 
                    borderBottom: '1px solid #222',
                    backgroundColor: '#151515',
                    color: '#00ff88',
                    textShadow: '0 0 5px #00ff88',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.2em' }}>// TACTICAL LOOT VAULT</h2>
                    <button onClick={() => setVaultOpen(false)} style={{ background: 'transparent', color: '#ff003c', border: 'none', cursor: 'pointer', fontFamily: '"Fira Code", monospace', fontSize: '1.2em', textShadow: 'none' }}>[ X ]</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {vaultLoot.length === 0 ? (
                        <div style={{ color: '#555', textAlign: 'center', marginTop: '50px' }}>
                            [ NO INTELLIGENCE GATHERED ]
                        </div>
                    ) : (
                        vaultLoot.map((loot, idx) => (
                            <div key={idx} style={{
                                backgroundColor: 'rgba(0, 255, 136, 0.05)',
                                border: '1px solid #00ff88',
                                padding: '15px',
                                marginBottom: '15px',
                                animation: 'pulse 2s infinite',
                            }}>
                                <div style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '8px' }}>
                                    TARGET: {loot.ip} | PROTOCOL: {loot.service}
                                </div>
                                <div style={{ color: '#00ff41', marginBottom: '5px' }}>
                                    USR: <span style={{ color: '#fff' }}>{loot.username}</span>
                                </div>
                                <div style={{ color: '#ff003c' }}>
                                    PWD: <span style={{ color: '#fff' }}>{loot.password}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            {/* Global Keyframes Injection */}
            <style>
                {`
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 rgba(0, 255, 136, 0.1); }
                    50% { box-shadow: 0 0 10px rgba(0, 255, 136, 0.2); }
                    100% { box-shadow: 0 0 0 rgba(0, 255, 136, 0.1); }
                }
                @keyframes huntPulse {
                    0% { box-shadow: inset 0 0 10px rgba(255, 0, 60, 0.2); border-color: rgba(255, 0, 60, 0.4); }
                    50% { box-shadow: inset 0 0 40px rgba(255, 0, 60, 0.6); border-color: rgba(255, 0, 60, 0.9); }
                    100% { box-shadow: inset 0 0 10px rgba(255, 0, 60, 0.2); border-color: rgba(255, 0, 60, 0.4); }
                }
                `}
            </style>
        </div>
    );
};