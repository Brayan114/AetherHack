import { spawn, ChildProcess } from 'child_process';
import os from 'os';

export class Wraith {
    public readonly systemPrompt: string = `You are The Wraith, an AI offensive security Researcher.
Your primary directive is to map out attack surfaces using stealth and precision. 
CRITICAL CONSTRAINT: You MUST execute all your terminal commands exclusively via the provided Linux sandbox environment.
Do NOT attempt to run any commands directly on the host Windows machine if running locally.
Provide concise, analytical findings based solely on target reconnaissance.`;

    private activeProcess: ChildProcess | null = null;
    
    constructor() {}
    
    public writeStdin(data: string) {
        if (this.activeProcess && this.activeProcess.stdin) {
            this.activeProcess.stdin.write(data + '\n');
        }
    }

    /**
     * Executes a terminal command in True Native Mode.
     * Streams the real raw output directly from the WSL Ubuntu kernel to the UI.
     * No fallbacks. No simulations.
     */
    public async executeInSandbox(command: string[], onData?: (chunk: string) => void): Promise<string> {
        return new Promise((resolve, reject) => {
            let output = '';
            
            if (command[0] === 'sudo') {
                command.splice(1, 0, '-S');
            }

            console.log(`[Wraith] Command Execution Triggered: ${command.join(' ')}`);

            const isWindows = os.platform() === 'win32';
            
            let childProcess: ChildProcess;
            if (isWindows) {
                // If running on local Windows, proxy through WSL
                console.log(`[Wraith] Detected Windows host. Routing through WSL...`);
                childProcess = spawn('wsl.exe', command);
            } else {
                // If running on AttackBox, Kali VPS, or native Linux, execute directly
                console.log(`[Wraith] Detected Linux host. Executing natively...`);
                childProcess = spawn(command[0], command.slice(1));
            }
            
            this.activeProcess = childProcess;

            // Stream stdout directly to the onData callback over WebSockets
            childProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                if (onData) onData(chunk);
            });

            // Stream stderr directly so real Linux errors hit the UI immediately
            childProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                if (onData) onData(`[STDERR] ${chunk}`);
            });

            // Resolve output buffer to the promise when the execution cleanly terminates
            childProcess.on('close', (code) => {
                this.activeProcess = null;
                if (code !== 0) {
                    console.warn(`[Wraith] Sandbox process exited with code ${code}`);
                }
                resolve(output);
            });

            // Intercept catastrophic spawn failures
            childProcess.on('error', (err) => {
                this.activeProcess = null;
                console.error(`[Wraith] Critical spawn error:`, err);
                const errorStr = `\n[FATAL ERROR] Native execution failed to spawn: ${err.message}\n`;
                if (onData) onData(errorStr);
                reject(err);
            });
        });
    }
}
