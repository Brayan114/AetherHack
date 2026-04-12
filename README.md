# AetherHack v1.0: Technical Documentation

## 1. Project Overview
**AetherHack** is an autonomous security orchestration platform that bridges the gap between raw network reconnaissance and high-level tactical intelligence. By decoupling the execution kernel from the reasoning engine, AetherHack allows security researchers to leverage any Large Language Model (LLM) to perform context-aware vulnerability analysis and autonomous credential extraction.

The platform operates on a **Bring Your Own Key (BYOK)** model, ensuring that intelligence remains in the hands of the operator while providing a unified interface for cloud-based and local LLM providers.

---

## 2. Code Architecture & System Flow
The architecture is divided into three distinct layers to ensure modularity and high-performance execution.

### **A. The Execution Kernel (The Wraith)**
* **Environment:** Native WSL (Windows Subsystem for Linux).
* **Logic:** Executes system-level commands (e.g., `nmap`, `curl`) directly in a Linux environment.
* **Streaming:** Real-time stdout and stderr streams are piped directly from the Linux process to the UI via WebSockets for zero-latency feedback.

### **B. The Neural Link (Universal Adapter)**
* **Modular Design:** A dependency-free REST bridge that supports multiple AI providers including Google Gemini, Anthropic (Claude), OpenAI, and local Ollama instances.
* **Stream Normalization:** A custom engine that intercepts distinct Server-Sent Event (SSE) architectures and normalizes them into a unified tactical response format.
* **Context Injection:** Each analysis utilizes a "Skill" protocol—a system prompt that defines the tactical constraints and response format for the agent.

### **C. The Intelligence Vault (Persistence)**
* **Loot Extraction:** A backend Regex-based interceptor identifies credentials (usernames, passwords, tokens) in the AI’s reasoning output.
* **Database:** Extracted intelligence is committed to a persistent `loot.json` datastore and broadcast to the UI.

---

## 3. Operational Modes
AetherHack features a stateful operational model to scale human capability through autonomous cycles.

* **Manual Mode:** Standard terminal interface where the operator retains 100% command control.
* **Semi-Auto Mode:** The agent analyzes findings and pre-fills the command buffer with the next logical tactical move. The operator executes with a single keystroke.
* **Hunt Mode (Recursive Autonomy):** The agent enters a recursive loop, executing its own suggested commands after a 2-second tactical delay. The loop terminates only upon completion of the objective or a system error.

---

## 4. User Guide & Implementation

### **Prerequisites**
1.  **Environment:** Windows with WSL2 enabled and a Linux distribution (e.g., Ubuntu) installed.
2.  **Dependencies:** Node.js environment for the server and React frontend.

### **Setup Sequence**
1.  **Initialization:** Start the backend server to establish the WebSocket link.
2.  **Neural Link Configuration:** Open the `Settings` modal to input your API key and select your preferred provider.
3.  **Command Execution:**
    * `recon <target>`: Initiates the Shadow Recon protocol (Nmap scan).
    * `web <url>`: Executes the Web Protocol (source code audit and credential leak detection).
    * `mode <manual|semi|hunt>`: Switches between operational autonomy levels.

---

## 5. UI Text Refinement (Professional Polish)
To ensure the platform maintains a professional, corporate-security aesthetic, replace the following strings in your source code:

| Current String (`Terminal.tsx` / `server.ts`) | Professional Replacement |
| :--- | :--- |
| `Rick is sup4r cool` | `Security Audit: [TARGET_ID]` |
| `...Burrrp... Morty...` (Web Audit Mock) | `[REDACTED SENSITIVE COMMENT]` |
| `We are so not doing this again` | `Duplicate Session Detected: Skipping Recon.` |
| `Wubbalubbadubdub` (Default Mock) | `[SECURE_STRING_ENCRYPTED]` |
| `No Intelligence Gathered` | `Awaiting Intelligence Acquisition...` |

---

## 6. Development Vision (Roadmap)
* **Spatial Mapping:** Integration of 3D network node visualization for complex enterprise environments.
* **Collaborative Vaults:** Distributed loot databases for multi-operator teams.
* **Agent Swarms:** Parallel processing of targets using multiple neural link adapters.

**Developer:** Brayan Osinaka (Orbit Studios)
**Version:** 1.0.0-STABLE
