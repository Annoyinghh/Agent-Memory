import os
import sys
import shutil
import subprocess

def install_skills(project_root):
    source = os.path.join(project_root, "skills", "agent-memory", "SKILL.md")
    
    # Target locations for different CLI agents (relative to project root)
    targets = [
        ".agents/skills/agent-memory/SKILL.md",
        ".gemini/skills/agent-memory/SKILL.md",
        ".claude/skills/agent-memory/SKILL.md",
        ".codex/skills/agent-memory/SKILL.md"
    ]
    
    if not os.path.exists(source):
        print(f"Error: Source file {source} does not exist!")
        return False

    print("Installing Agent Memory Skill to local CLI folders...")
    for target in targets:
        target_path = os.path.join(project_root, target)
        target_dir = os.path.dirname(target_path)
        try:
            os.makedirs(target_dir, exist_ok=True)
            shutil.copy(source, target_path)
            print(f"  [OK] Installed to: {target}")
        except Exception as e:
            print(f"  [Failed] Could not install to: {target}. Error: {e}")
    return True

def register_mcp_servers(project_root):
    # Dynamically use the active python interpreter and locate server.py relative to project root
    python_exe = sys.executable
    server_py = os.path.abspath(os.path.join(project_root, "Agent-Memory-Server", "server.py"))

    print("\nRegistering MCP server via CLI tools...")

    # 1. Gemini CLI & Antigravity (shares .gemini/settings.json)
    try:
        print("Registering with Gemini CLI / Antigravity...")
        cmd = f'gemini mcp add agent-memory "{python_exe}" "{server_py}"'
        subprocess.run(cmd, shell=True, check=True)
        print("  [OK] Registered with Gemini CLI / Antigravity.")
    except Exception as e:
        print(f"  [Skip/Failed] Gemini CLI registration failed or not installed: {e}")

    # 2. Codex CLI
    try:
        print("Registering with Codex CLI...")
        cmd = f'codex mcp add agent-memory -- "{python_exe}" "{server_py}"'
        subprocess.run(cmd, shell=True, check=True)
        print("  [OK] Registered with Codex CLI.")
    except Exception as e:
        print(f"  [Skip/Failed] Codex CLI registration failed or not installed: {e}")

    # 3. Claude Code CLI
    try:
        print("Registering with Claude Code CLI...")
        cmd = f'claude mcp add agent-memory --env PYTHONIOENCODING=utf-8 -- "{python_exe}" "{server_py}"'
        subprocess.run(cmd, shell=True, check=True)
        print("  [OK] Registered with Claude Code CLI.")
    except Exception as e:
        print(f"  [Skip/Failed] Claude Code CLI registration failed or not installed: {e}")

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    if install_skills(project_root):
        register_mcp_servers(project_root)
        print("\nSetup Complete!")
        print("These skills will be discovered automatically by:")
        print(" - Antigravity (via .agents/skills/)")
        print(" - Gemini CLI (via .gemini/skills/)")
        print(" - Claude Code (via .claude/skills/)")
        print(" - Codex (via .codex/skills/)")

if __name__ == "__main__":
    main()
