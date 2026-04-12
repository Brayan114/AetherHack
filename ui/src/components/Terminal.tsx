import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

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

type LineType = 'system' | 'raw' | 'analysis' | 'error';
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
    provider: 'gemini' | 'openai' | 'ollama' | 'anthropic' | 'mistral' | 'perplexity' | 'custom';
    apiKey: string;
    baseUrl: string;
    model: string;
}

export const Terminal: React.FC = () => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [input, setInput] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [booted, setBooted] = useState(false);
    
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
    const endOfTerminalRef = useRef<HTMLDivElement>(null);

    // Keep ref in sync for timeouts
    useEffect(() => {
        operatingModeRef.current = operatingMode;
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
            } else {
                setIsScanning(false);
                setLines(prev => [...prev, { type: 'system', text: '[SYSTEM] Protocol Sequence Complete.' }]);
            }
        });

        socket.on('scan-error', (data) => {
            setIsScanning(false);
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
        endOfTerminalRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines, input]);

    // Auto-Injector for Semi & Hunt Modes
    useEffect(() => {
        if ((operatingMode === 'semi' || operatingMode === 'hunt') && !isScanning && lines.length > 0) {
            const lastLine = [...lines].reverse().find(l => l.type === 'analysis');
            if (lastLine) {
                const match = lastLine.text.match(/\[\?\] SUGGESTED_COMMAND:\s*(.+)/);
                if (match && lastInjectedRef.current !== match[1].trim()) {
                    const cmd = match[1].trim();
                    setInput(cmd);
                    lastInjectedRef.current = cmd;

                    // Fully Autonomous Trigger
                    if (operatingMode === 'hunt') {
                        setLines(prev => [...prev, { type: 'system', text: `[AUTONOMY] Executing tactical directive in 2 seconds...` }]);
                        setTimeout(() => {
                            if (operatingModeRef.current === 'hunt') {
                                executeCommand(cmd);
                                setInput('');
                            } else {
                                setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Directive cancelled. Operator override detected.` }]);
                            }
                        }, 2000);
                    }
                }
            }
        }
    }, [lines, isScanning, operatingMode]);

    const executeCommand = (rawInput: string) => {
        if (!rawInput) return;

        setLines(prev => [...prev, { type: 'system', text: `> ${rawInput}` }]);

        const parts = rawInput.split(/\s+/);
        const baseCommand = parts[0].toLowerCase();
        const target = parts[1] || '127.0.0.1';

        if (baseCommand === 'recon') {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Neural link established. Target acquired: ${target}` }]);
            socketRef.current?.emit('run-scan', { target, settings: neural });
        } else if (baseCommand === 'web') {
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Extracting source code via Web Protocol from: ${target}` }]);
            socketRef.current?.emit('run-web-audit', { target, settings: neural });
        } else if (baseCommand === 'mode' && (target === 'manual' || target === 'semi' || target === 'hunt')) {
            setOperatingMode(target as OperatingMode);
            setLines(prev => [...prev, { type: 'system', text: `[SYSTEM] Tactical Mode Engaged: [${target.toUpperCase()}]` }]);
            if (target === 'manual') {
                setInput('');
                lastInjectedRef.current = null;
            }
        } else if (baseCommand === 'clear') {
            setLines([]);
        } else {
            setLines(prev => [...prev, { type: 'error', text: `Command not recognized: ${baseCommand}` }]);
        }
        
        lastInjectedRef.current = null;
    };

    const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (booted && !settingsOpen) {
            if (e.key === 'Enter') {
                executeCommand(input.trim());
                setInput('');
            } else if (e.key === ' ' && (operatingMode === 'semi' || operatingMode === 'hunt') && input.trim().length > 0 && input === lastInjectedRef.current) {
                e.preventDefault();
                executeCommand(input.trim());
                setInput('');
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
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', backgroundColor: '#000' }}>
            
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
                        <option value="perplexity">Perplexity</option>
                        <option value="ollama">Local (Ollama)</option>
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

            {/* The Main Terminal Window */}
            <div style={{
                flex: 1,
                backgroundColor: '#0a0a0a',
                color: '#00ff41',
                fontFamily: '"Fira Code", monospace',
                padding: '20px',
                overflowY: 'auto',
                transition: 'all 0.3s ease-in-out',
                marginRight: vaultOpen ? '400px' : '0px',
                boxSizing: 'border-box',
                boxShadow: operatingMode === 'hunt' ? 'inset 0 0 30px rgba(255, 0, 60, 0.4)' : 'none',
                border: operatingMode === 'hunt' ? '2px solid rgba(255, 0, 60, 0.8)' : '2px solid transparent',
                animation: operatingMode === 'hunt' ? 'huntPulse 2s infinite' : 'none',
                filter: settingsOpen ? 'brightness(0.2)' : 'none'
            }}>
                <div style={{ position: 'fixed', top: '20px', right: vaultOpen ? '420px' : '20px', zIndex: 1000, display: 'flex', gap: '15px', transition: 'right 0.3s ease' }}>
                    
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

                    <button
                        onClick={() => setSettingsOpen(true)}
                        style={{
                            backgroundColor: '#111',
                            color: '#00ff88',
                            border: '1px solid #00ff88',
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontFamily: '"Fira Code", monospace',
                        }}
                    >
                        [ ⚙️ SETTINGS ]
                    </button>
                    <button
                        onClick={() => setVaultOpen(!vaultOpen)}
                        style={{
                            backgroundColor: '#111',
                            color: vaultOpen ? '#ff003c' : '#00ff88',
                            border: `1px solid ${vaultOpen ? '#ff003c' : '#00ff88'}`,
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontFamily: '"Fira Code", monospace',
                            transition: 'background-color 0.2s',
                        }}
                    >
                        {vaultOpen ? '[ CLOSE VAULT ]' : `[ OPEN VAULT (${vaultLoot.length}) ]`}
                    </button>
                </div>

                <div>
                    {lines.map((line, idx) => {
                        const suggestMatch = line.type === 'analysis' ? line.text.match(/\[\?\] SUGGESTED_COMMAND:\s*(.+)/) : null;
                        return (
                            <div key={idx} style={{
                                padding: '2px 0',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                ...getLineStyle(line.type)
                            }}>
                                {line.text}
                                {suggestMatch && !isScanning && operatingMode === 'manual' && (
                                    <button 
                                        onClick={() => executeCommand(suggestMatch[1].trim())}
                                        style={{
                                            marginLeft: '15px',
                                            backgroundColor: '#00ff88',
                                            color: '#0a0a0a',
                                            border: 'none',
                                            padding: '2px 8px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontFamily: '"Fira Code", monospace'
                                        }}
                                    >
                                        EXECUTE
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {booted && (
                    <div style={{ display: 'flex', marginTop: '10px' }}>
                        <span style={{ marginRight: '10px', color: operatingMode === 'hunt' ? '#ff003c' : '#00ff41' }}>&gt;</span>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleCommand}
                            style={{
                                backgroundColor: 'transparent',
                                color: (operatingMode === 'hunt' || operatingMode === 'semi') && input === lastInjectedRef.current ? '#00ff88' : '#00ff41',
                                border: 'none',
                                outline: 'none',
                                flex: 1,
                                fontFamily: '"Fira Code", monospace',
                                fontSize: '1em',
                                textShadow: operatingMode === 'hunt' ? '0 0 5px #ff003c' : 'none'
                            }}
                            autoFocus
                        />
                    </div>
                )}
                <div ref={endOfTerminalRef} />
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