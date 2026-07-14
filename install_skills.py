"""
One-click setup: register the agent-memory MCP server with every local CLI and
distribute the SKILL.md.

DOCKER MODE (default)
---------------------
The MCP server runs INSIDE the `agent-memory-server` Docker image. Each CLI is
configured to launch it via `docker run -i --rm`, mounting the SAME data volume
the compose backend uses. This keeps a single data owner (no split-brain between
a local conda process and the container) — the root cause of the historical
"Error finding id" / cross-process ChromaDB stale-handle bugs.

For Reasonix, the default mode uses HTTP (streamable-http) against the Docker
Compose `mcp` container on port 8901, written to the project-level
`reasonix.toml`. Pass --reasonix-global to register globally (available in all
Reasonix sessions). Pass --reasonix-stdio to use per-call `docker run` stdio
instead (matching other CLI tools).

Run AFTER `docker compose up -d --build` so the image exists.

    python install_skills.py

LEGACY LOCAL MODE (not recommended)
-----------------------------------
If you genuinely can't use Docker, pass --local to register the conda/venv
python directly (restores the old behavior). This re-introduces the multi-process
data race against the container — avoid unless the backend is also running on
bare python.
"""

import os
import sys
import shutil
import shlex
import argparse
import subprocess

IMAGE = "agent-memory-server"
CONTAINER_DATA = "/app/data"          # mount target inside the container
SERVER_ENTRY = "python server.py"     # entrypoint args after the image name


# ── helpers ──────────────────────────────────────────────────────────────────

def _data_volume_arg(project_root: str) -> str:
    """Absolute host path to the data dir, suitable for a Docker -v mount."""
    data_dir = os.path.abspath(os.path.join(project_root, "Agent-Memory-Server", "data"))
    # Normalize Windows backslashes to forward slashes (Docker accepts these on
    # all platforms; backslashes break the mount on Linux/macOS).
    return data_dir.replace("\\", "/") + ":" + CONTAINER_DATA


def _docker_run_args(data_volume: str) -> list:
    """The shared `docker run` argv prefix every CLI gets."""
    return [
        "run", "-i", "--rm",
        "-v", data_volume,
        "-e", "PYTHONIOENCODING=utf-8",
        IMAGE,
        "python", "server.py",
    ]


def _docker_available() -> bool:
    try:
        r = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=15)
        return r.returncode == 0
    except Exception:
        return False


def _image_exists() -> bool:
    try:
        r = subprocess.run(
            ["docker", "image", "inspect", IMAGE],
            capture_output=True, text=True, timeout=15,
        )
        return r.returncode == 0
    except Exception:
        return False


def _local_python_and_server(project_root: str):
    """Legacy: the active interpreter + absolute server.py path."""
    return sys.executable, os.path.abspath(
        os.path.join(project_root, "Agent-Memory-Server", "server.py")
    )


# ── Reasonix support ──────────────────────────────────────────────────────────

REASONIX_HTTP_URL = "http://localhost:8901/mcp"


def _reasonix_http_block() -> str:
    """TOML [[plugins]] block for Reasonix HTTP mode (Docker Compose mcp container)."""
    return (
        '[[plugins]]\n'
        'name    = "agent-memory"\n'
        'type    = "http"\n'
        'url     = "%s"\n'
    ) % REASONIX_HTTP_URL


def _reasonix_stdio_block(project_root: str) -> str:
    """TOML [[plugins]] block for Reasonix stdio mode (docker run per-call)."""
    data_volume = _data_volume_arg(project_root)
    return (
        '[[plugins]]\n'
        'name    = "agent-memory"\n'
        'type    = "stdio"\n'
        'command = "docker"\n'
        'args    = ["run", "-i", "--rm",\n'
        '          "-v", "%s",\n'
        '          "-e", "PYTHONIOENCODING=utf-8",\n'
        '          "%s",\n'
        '          "python", "server.py"]\n'
    ) % (data_volume, IMAGE)


def get_reasonix_project_config_path(project_root: str) -> str:
    """Path to the project-level reasonix.toml."""
    return os.path.join(project_root, "reasonix.toml")


def get_reasonix_global_config_path() -> str | None:
    """Path to the global Reasonix config, or None if home dir unreachable."""
    # Windows: %APPDATA%/reasonix/config.toml
    appdata = os.environ.get("APPDATA")
    if appdata:
        return os.path.join(appdata, "reasonix", "config.toml")
    # Linux/macOS: ~/.config/reasonix/config.toml
    home = os.path.expanduser("~/.config/reasonix/config.toml")
    if os.path.exists(home) or os.path.exists(os.path.dirname(home)):
        return home
    # Fallback: ~/.reasonix/config.toml
    return os.path.join(os.path.expanduser("~"), ".reasonix", "config.toml")


def write_reasonix_mcp(config_path: str, use_http: bool = True, project_root: str | None = None):
    """Append (or create) a [[plugins]] section to the given reasonix config.

    Args:
        config_path: Absolute path to the reasonix config file.
        use_http: If True, register via HTTP (Docker Compose mcp container on port 8901).
                  If False, register via stdio (docker run per-call, like other CLI tools).
        project_root: Project root (required for stdio mode to compute Docker volume paths).
    """
    if not use_http and not project_root:
        raise ValueError("project_root is required for stdio mode")

    block = _reasonix_http_block() if use_http else _reasonix_stdio_block(project_root)

    try:
        existing = ""
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                existing = f.read().rstrip()

        # Check if agent-memory plugin is already registered (avoid duplicates).
        if "name    = \"agent-memory\"" in existing:
            rel = os.path.relpath(config_path)
            print(f"  [Skip] {rel}: agent-memory plugin already present")
            return

        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "a", encoding="utf-8") as f:
            if existing:
                f.write("\n\n")
            f.write(block)

        mode = "HTTP (Docker Compose mcp:8901)" if use_http else "stdio (docker run per-call)"
        rel = os.path.relpath(config_path)
        print(f"  [OK] {rel}: agent-memory registered ({mode})")
    except Exception as e:
        rel = os.path.relpath(config_path)
        print(f"  [Failed] {rel}: {e}")


def write_reasonix_project_mcp(project_root: str, use_http: bool = True):
    """Append (or create) a [[plugins]] section to the project's reasonix.toml."""
    path = get_reasonix_project_config_path(project_root)
    write_reasonix_mcp(path, use_http=use_http)


def write_reasonix_global_mcp(use_http: bool = True, project_root: str | None = None):
    """Append (or create) a [[plugins]] section to the global Reasonix config.

    All Reasonix sessions on this machine will then have agent-memory available.
    """
    path = get_reasonix_global_config_path()
    if not path:
        print("  [Failed] Cannot determine global Reasonix config path")
        return
    write_reasonix_mcp(path, use_http=use_http, project_root=project_root)


# ── skill distribution (unchanged, host-side files) ──────────────────────────

def install_skills(project_root):
    source = os.path.join(project_root, "skills", "agent-memory", "SKILL.md")
    targets = [
        ".agents/skills/agent-memory/SKILL.md",
        ".gemini/skills/agent-memory/SKILL.md",
        ".claude/skills/agent-memory/SKILL.md",
        ".codex/skills/agent-memory/SKILL.md",
        ".reasonix/skills/agent-memory/SKILL.md",
    ]
    if not os.path.exists(source):
        print(f"Error: Source skill file {source} does not exist!")
        return False

    print("Installing Agent Memory SKILL.md to local CLI folders...")
    for target in targets:
        target_path = os.path.join(project_root, target)
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            shutil.copy(source, target_path)
            print(f"  [OK] {target}")
        except Exception as e:
            print(f"  [Failed] {target}: {e}")
    return True


# ── MCP registration ──────────────────────────────────────────────────────────

def _gemini_mcp_block(use_docker, project_root):
    """The JSON object written under mcpServers.agent-memory for Gemini."""
    if use_docker:
        return {
            "command": "docker",
            "args": _docker_run_args(_data_volume_arg(project_root)),
            "type": "stdio",
        }
    python_exe, server_py = _local_python_and_server(project_root)
    return {"command": python_exe, "args": [server_py], "type": "stdio"}


def write_gemini_project_mcp(project_root, use_docker=True):
    """Write the Gemini/Antigravity PROJECT-LEVEL config directly.

    `gemini mcp add` writes to the GLOBAL config by default and does NOT override
    a pre-existing project-level `.gemini/settings.json` entry — which is exactly
    how a stale conda MCP survived there and raced the Docker backend (stale-handle
    data loss + 'Error finding id'). So we patch the project file explicitly.
    """
    import json
    path = os.path.join(project_root, ".gemini", "settings.json")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cfg = {}
        if os.path.exists(path):
            try:
                cfg = json.load(open(path, encoding="utf-8"))
                if not isinstance(cfg, dict):
                    cfg = {}
            except Exception:
                cfg = {}
        # Gemini stores MCP servers under top-level "mcpServers".
        cfg.setdefault("mcpServers", {})["agent-memory"] = _gemini_mcp_block(use_docker, project_root)
        json.dump(cfg, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"  [OK] Gemini project config written: {os.path.relpath(path, project_root)}")
    except Exception as e:
        print(f"  [Failed] Gemini project config: {e}")


def register_mcp_servers(project_root, use_docker=True, reasonix_stdio=False, reasonix_global=False):
    print("\nRegistering MCP server via CLI tools...")

    if use_docker:
        data_volume = _data_volume_arg(project_root)
        run_args = _docker_run_args(data_volume)
        # Each CLI command is:  <cli> mcp add agent-memory -- docker run ... image python server.py
        # The `docker` binary is the command; everything after `--` is the launch argv.
        mcp_cmds = {
            "Claude Code": ['claude', 'mcp', 'add', 'agent-memory',
                            '--env', 'PYTHONIOENCODING=utf-8', '--',
                            'docker'] + run_args,
            "Codex":       ['codex', 'mcp', 'add', 'agent-memory', '--',
                            'docker'] + run_args,
            # Gemini/Antigravity handled below by direct project-file write
            # (`gemini mcp add` won't override an existing project-level entry).
        }
        print(f"  mode: docker | image: {IMAGE} | volume: {data_volume}")
    else:
        python_exe, server_py = _local_python_and_server(project_root)
        mcp_cmds = {
            "Claude Code": ['claude', 'mcp', 'add', 'agent-memory',
                            '--env', 'PYTHONIOENCODING=utf-8', '--',
                            python_exe, server_py],
            "Codex":       ['codex', 'mcp', 'add', 'agent-memory', '--',
                            python_exe, server_py],
        }
        print(f"  mode: LOCAL (python={python_exe}) — NOT recommended with Docker backend")

    for name, cmd in mcp_cmds.items():
        try:
            print(f"Registering with {name}...")
            subprocess.run(cmd, check=True)
            print(f"  [OK] {name}")
        except FileNotFoundError:
            print(f"  [Skip] {name} CLI not installed")
        except subprocess.CalledProcessError as e:
            print(f"  [Skip/Failed] {name}: exit {e.returncode}")
        except Exception as e:
            print(f"  [Skip/Failed] {name}: {e}")

    # Gemini/Antigravity: write project-level config directly (see write_gemini_project_mcp).
    print("Registering Gemini / Antigravity (project config)...")
    write_gemini_project_mcp(project_root, use_docker=use_docker)

    # Reasonix: write config directly (project-level or global).
    if reasonix_global:
        print("Registering Reasonix (global config)...")
        write_reasonix_global_mcp(use_http=not reasonix_stdio, project_root=project_root)
    else:
        print("Registering Reasonix (project config)...")
        write_reasonix_project_mcp(project_root, use_http=not reasonix_stdio)


# ── entrypoint ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Register agent-memory MCP + install skills")
    parser.add_argument("--local", action="store_true",
                        help="Use local conda/venv python instead of Docker (NOT recommended)")
    parser.add_argument("--skip-mcp", action="store_true",
                        help="Only distribute SKILL.md, don't touch MCP config")
    parser.add_argument("--reasonix-stdio", action="store_true",
                        help="Register Reasonix MCP via stdio (docker run per-call) instead of HTTP (Docker Compose mcp:8901)")
    parser.add_argument("--reasonix-global", action="store_true",
                        help="Register in the GLOBAL Reasonix config (%%APPDATA%%/reasonix/config.toml) instead of project-level reasonix.toml. All Reasonix sessions will see agent-memory.")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.abspath(__file__))

    if not install_skills(project_root):
        sys.exit(1)

    if args.skip_mcp:
        print("\n--skip-mcp: skill files installed, MCP config untouched.")
        return

    use_docker = not args.local
    if use_docker:
        if not _docker_available():
            print("\n[!] Docker not available. Install Docker Desktop / Engine, run "
                  "`docker compose up -d --build`, then re-run this script.")
            print("    (Or pass --local to use the active Python — not recommended.)")
            sys.exit(1)
        if not _image_exists():
            print(f"\n[!] Image '{IMAGE}' not found. Build it first with:")
            print(f"      docker compose up -d --build")
            sys.exit(1)

    register_mcp_servers(project_root, use_docker=use_docker, reasonix_stdio=args.reasonix_stdio, reasonix_global=args.reasonix_global)

    if use_docker:
        print("\nSetup complete. MCP runs in the container (single data owner).")
        print("Restart each CLI session (or /mcp) to pick up the new config.")
        if args.reasonix_global:
            print("Reasonix: registered globally — available in ALL project sessions.")
        else:
            print("Reasonix: registered in project-level reasonix.toml (this project only).")
            print("         Pass --reasonix-global to make it available everywhere.")
    else:
        print("\nSetup complete (LOCAL mode). WARNING: a local python MCP + the Docker")
        print("backend both touch the same data — this can cause stale-handle data loss.")

    print("Skills discovered by: Antigravity (.agents/skills), Gemini (.gemini/skills),")
    print("Claude Code (.claude/skills), Codex (.codex/skills), Reasonix (.reasonix/skills).")


if __name__ == "__main__":
    main()
