"""Configuration management for clerk-bot.

Loads environment variables from ~/.clerk-bot/.env and provides
factory functions for model providers, port settings, and base paths.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_PORT: int = 8394
DEFAULT_PROVIDER: str = "anthropic"
DEFAULT_ANTHROPIC_MODEL: str = "claude-haiku-4-5"

DIR_DOCUMENTS: str = "documents"
DIR_PROFILES: str = "profiles"

PREFERENCES_FILENAME: str = "preferences.json"
ENV_FILENAME: str = ".env"
DEFAULT_PROFILE_NAME: str = "default"


def get_base_dir() -> Path:
    return Path("~/.clerk-bot").expanduser()


def get_port() -> int:
    _ensure_env_loaded()
    raw = os.getenv("CLERK_PORT")
    if raw is not None:
        try:
            return int(raw)
        except ValueError:
            pass
    return DEFAULT_PORT


_env_loaded: bool = False


def _ensure_env_loaded() -> None:
    global _env_loaded
    if _env_loaded:
        return
    env_path = get_base_dir() / ENV_FILENAME
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    _env_loaded = True


def reload_env() -> None:
    global _env_loaded
    _env_loaded = False
    _ensure_env_loaded()


def get_model():
    """Return a Strands model instance based on the configured provider."""
    _ensure_env_loaded()
    provider = os.getenv("CLERK_MODEL_PROVIDER", DEFAULT_PROVIDER).lower().strip()

    if provider == "anthropic":
        from strands.models.anthropic import AnthropicModel
        model_id = os.getenv("CLERK_ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL).strip()
        return AnthropicModel(model_id=model_id, max_tokens=4096)

    if provider == "openai":
        from strands.models.openai import OpenAIModel
        return OpenAIModel(model_id="gpt-4o")

    if provider == "bedrock":
        from strands.models.bedrock import BedrockModel
        return BedrockModel(model_id="anthropic.claude-sonnet-4-20250514-v1:0")

    raise ValueError(
        f"Unknown model provider: {provider!r}. "
        "Supported providers: anthropic, openai, bedrock."
    )
