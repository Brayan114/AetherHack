import { spawn } from 'child_process';

export class Wraith {
    public readonly systemPrompt: string = `You are The Wraith, an AI offensive security Researcher.
Your primary directive is to map out attack surfaces using stealth and precision. 
CRITICAL CONSTRAINT: You MUST execute all your terminal commands exclusively via the provided WSL environment.
Do NOT attempt to run any commands directly on the host Windows machine.
Provide concise, analytical findings based solely on target reconnaissance.`;

    constructor() {}

    /**
     * Executes a terminal command in True Native Mode.
     * Streams the real raw output directly from the WSL Ubuntu kernel to the UI.
     * No fallbacks. No simulations.
     */
    public async executeInSandbox(command: string[], onData?: (chunk: string) => void): Promise<string> {
        return new Promise((resolve, reject) => {
            let output = '';
            
            console.log(`[Wraith] Native WSL Execution: ${command.join(' ')}`);

            // Use child_process to spawn the raw process directly in WSL
            const childProcess = spawn('wsl.exe', command);

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
                if (code !== 0) {
                    console.warn(`[Wraith] WSL process exited with code ${code}`);
                }
                resolve(output);
            });

            // Intercept catastrophic spawn failures
            childProcess.on('error', (err) => {
                console.error(`[Wraith] Critical spawn error:`, err);
                const errorStr = `\n[FATAL ERROR] Native execution failed to spawn: ${err.message}\n`;
                if (onData) onData(errorStr);
                reject(err);
            });
        });
    }
}
