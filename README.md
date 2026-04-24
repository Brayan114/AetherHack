# AetherHack: Autonomous Security Intelligence

AetherHack is an LLM-Agnostic, Multi-Agent Offensive Security platform engineered to automate topography intelligence and offensive penetration mechanics natively. 

Powered by a dynamic reasoning loop and a WebGL spatial engine, it intercepts your commands, bridges directly into a Linux kernel (WSL or Native), parses the output stream via cutting edge logic, and recursively suggests subsequent tactical actions to aggressively map out your attack surface.

## Core Features

- **The Universal Neural Adapter**: Native backend bridging architecture processing streams dynamically across **Google Gemini**, **Anthropic (Claude)**, **Mistral**, **Perplexity**, and local **Ollama** infrastructure—without bloated SDK overheads.
- **Operational Autonomy**: Terminal protocols function under stringently parsed states. Engage `HUNT` mode, and The Architect will seamlessly self-chain offensive commands with a two-second tactical delay, executing autonomously until a vector is definitively breached.
- **RAG Knowledge Vault**: Built-in integration with Google Gemini embeddings to autonomously fetch the most relevant payloads and methodologies during attacks.
- **Cross-Platform Cloud Readiness**: The execution engine dynamically detects its environment. Run it locally via Windows Subsystem for Linux (WSL), or deploy it natively to a Kali VPS or the TryHackMe AttackBox for zero-configuration hacking.
- **Matrix 3D Spatial Recognition**: Built natively utilizing React-Three-Fiber, AetherHack visualizes unique clusters stored within your `Loot Vault` inside an optimized, rotating constellation of Nodes hovering cleanly beneath your console.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Linux Environment (TryHackMe AttackBox, Kali VPS, or Windows WSL with Ubuntu)
- Your preferred Neural Provider API Key (OpenRouter, Gemini, Anthropic, etc)

### Initializing the Core

Boot the backend API and Neural Interface:
```bash
# Terminal 1: Boot The Brain
cd AetherHack
npm install
npm run dev
```

Boot the UI and WebGL Pipeline:
```bash
# Terminal 2: Boot The UI Component
cd AetherHack/ui
npm install
npm run dev
```

The system will connect and expose the primary interface at `localhost:5173`. Hit the Settings gear, load your Neural API parameters, select a mode, and execute `recon [TARGET_IP]`.

> **Notice:** The repository operates dynamically mapped intelligence paths. Executing `HUNT` procedures against unauthorized environments constitutes explicit violations of engagement protocols. AetherHack defaults to aggressive service enumeration. Use responsibly.
