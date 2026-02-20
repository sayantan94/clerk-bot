"""Typer CLI for clerk-bot.

Commands
--------
- ``clerk-bot init``   -- interactive first-time setup
- ``clerk-bot start``  -- launch the FastAPI server
- ``clerk-bot status`` -- display current runtime / configuration status
"""

from __future__ import annotations

import json
import socket
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table

from src.config import (
    DEFAULT_PORT,
    ENV_FILENAME,
    get_base_dir,
    get_port,
    reload_env,
)
from src.storage.filesystem import (
    ensure_directories,
    get_documents_dir,
    get_env_path,
    get_preferences_path,
    get_profile_path,
    list_documents,
)

app = typer.Typer(
    name="clerk-bot",
    help="AI-Powered Universal Form Auto-Filler",
    add_completion=False,
)
console = Console()

PROVIDERS = ("anthropic", "openai", "bedrock")

API_KEY_ENV_MAP: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "bedrock": "AWS_PROFILE",
}

API_KEY_PROMPTS: dict[str, str] = {
    "anthropic": "Enter your Anthropic API key",
    "openai": "Enter your OpenAI API key",
    "bedrock": "Enter your AWS profile name (or press Enter for 'default')",
}


def _is_port_in_use(port: int) -> bool:
    """Return True if *port* on localhost is currently accepting connections."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _write_env_file(path: Path, provider: str, api_key: str, port: int) -> None:
    """Write a minimal .env file for clerk-bot."""
    env_var = API_KEY_ENV_MAP[provider]
    lines = [
        "# clerk-bot configuration",
        f"CLERK_MODEL_PROVIDER={provider}",
        f"{env_var}={api_key}",
        f"CLERK_PORT={port}",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def _count_preferences() -> int:
    """Return the number of stored preferences, or 0 if the file is missing."""
    prefs_path = get_preferences_path()
    if not prefs_path.exists():
        return 0
    try:
        data = json.loads(prefs_path.read_text(encoding="utf-8"))
        return len(data.get("preferences", {}))
    except (json.JSONDecodeError, KeyError):
        return 0


@app.command()
def init() -> None:
    """Create the ~/.clerk-bot/ directory structure and write initial config."""

    console.print(
        Panel(
            "[bold cyan]clerk-bot[/bold cyan] -- first-time setup",
            subtitle="AI-Powered Universal Form Auto-Filler",
        )
    )

    base = get_base_dir()

    # 1. Create directories ------------------------------------------------
    console.print("\n[bold]1.[/bold] Creating directory structure ...")
    ensure_directories()
    console.print(f"   [green]\u2713[/green] {base / 'documents'}")
    console.print(f"   [green]\u2713[/green] {base / 'profiles'}")

    # 2. Choose model provider ---------------------------------------------
    console.print()
    provider = Prompt.ask(
        "[bold]2.[/bold] Select a model provider",
        choices=list(PROVIDERS),
        default="anthropic",
    )

    # 3. API key / credential ----------------------------------------------
    prompt_text = API_KEY_PROMPTS[provider]
    default_value = "default" if provider == "bedrock" else ""
    api_key = Prompt.ask(
        f"[bold]3.[/bold] {prompt_text}",
        default=default_value if default_value else None,
    )
    if not api_key:
        console.print("[red]No key provided. Aborting.[/red]")
        raise typer.Exit(code=1)

    # 4. Port ---------------------------------------------------------------
    port_str = Prompt.ask(
        "[bold]4.[/bold] Server port",
        default=str(DEFAULT_PORT),
    )
    try:
        port = int(port_str)
    except ValueError:
        console.print(f"[red]Invalid port: {port_str}. Using default {DEFAULT_PORT}.[/red]")
        port = DEFAULT_PORT

    # 5. Write .env ---------------------------------------------------------
    env_path = get_env_path()
    _write_env_file(env_path, provider, api_key, port)
    console.print(f"\n   [green]\u2713[/green] Configuration written to [bold]{env_path}[/bold]")

    # Reload so subsequent commands see the new values
    reload_env()

    # 6. Summary ------------------------------------------------------------
    console.print(
        Panel(
            f"[bold green]Setup complete![/bold green]\n\n"
            f"  Base dir : {base}\n"
            f"  Provider : {provider}\n"
            f"  Port     : {port}\n\n"
            f"Drop your documents (PDF, images) into:\n"
            f"  [cyan]{base / 'documents'}[/cyan]\n\n"
            f"Then run [bold]clerk-bot start[/bold] to launch the server.",
            title="Done",
        )
    )


@app.command()
def start(
    host: str = typer.Option("127.0.0.1", help="Bind address"),
    port: int | None = typer.Option(None, help="Override configured port"),
    reload: bool = typer.Option(False, help="Enable auto-reload (development)"),
) -> None:
    """Load configuration and start the clerk-bot server."""

    import uvicorn

    reload_env()

    effective_port = port if port is not None else get_port()

    env_path = get_env_path()
    if not env_path.exists():
        console.print(
            "[red]Configuration not found.[/red] Run [bold]clerk-bot init[/bold] first."
        )
        raise typer.Exit(code=1)

    console.print(
        Panel(
            f"Starting [bold cyan]clerk-bot[/bold cyan] server\n"
            f"  Address : http://{host}:{effective_port}\n"
            f"  Reload  : {'on' if reload else 'off'}",
            title="clerk-bot",
        )
    )

    uvicorn.run(
        "src.server:app",
        host=host,
        port=effective_port,
        reload=reload,
    )


@app.command()
def status() -> None:
    """Show the current status of clerk-bot."""

    reload_env()

    base = get_base_dir()
    port = get_port()
    env_exists = get_env_path().exists()
    server_running = _is_port_in_use(port)
    documents = list_documents()
    profile_cached = get_profile_path().exists()
    pref_count = _count_preferences()

    # Build table -----------------------------------------------------------
    table = Table(title="clerk-bot status", show_header=False, padding=(0, 2))
    table.add_column("Key", style="bold")
    table.add_column("Value")

    table.add_row("Base directory", str(base))
    table.add_row(
        "Configuration",
        "[green]found[/green]" if env_exists else "[red]missing -- run clerk-bot init[/red]",
    )
    table.add_row(
        "Server",
        f"[green]running[/green] on port {port}"
        if server_running
        else f"[yellow]stopped[/yellow] (port {port})",
    )
    table.add_row("Documents", str(len(documents)))
    table.add_row(
        "Profile cached",
        "[green]yes[/green]" if profile_cached else "[yellow]no[/yellow]",
    )
    table.add_row("Learned preferences", str(pref_count))

    console.print()
    console.print(table)
    console.print()

    # List documents if any -------------------------------------------------
    if documents:
        doc_table = Table(title="Documents", show_header=True)
        doc_table.add_column("#", style="dim")
        doc_table.add_column("Filename")
        doc_table.add_column("Size")
        for idx, doc in enumerate(documents, 1):
            size = doc.stat().st_size
            if size < 1024:
                size_str = f"{size} B"
            elif size < 1024 * 1024:
                size_str = f"{size / 1024:.1f} KB"
            else:
                size_str = f"{size / (1024 * 1024):.1f} MB"
            doc_table.add_row(str(idx), doc.name, size_str)
        console.print(doc_table)
        console.print()


if __name__ == "__main__":
    app()
