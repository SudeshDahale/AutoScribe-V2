from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:8081"
    github_client_id: str
    github_client_secret: str
    github_redirect_uri: str = "http://localhost:8000/api/auth/github/callback"
    fernet_key: str
    frontend_url: str = "http://localhost:8081"

    # LLM provider configuration — supports openai, groq, gemini, ollama
    llm_provider: str = "groq"  # openai | groq | gemini | ollama
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"
    llm_embedding_model: str = "text-embedding-3-small"

    # Optional per-provider keys (fallback to llm_api_key if empty)
    groq_api_key: str = ""
    gemini_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434/v1"

    github_webhook_secret: str = "dev-webhook-secret"

    # Autonomous engine configuration
    engine_mode: str = "active"  # active | paused | manual
    poller_interval_seconds: int = 300  # 5 minutes

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def effective_api_key(self) -> str:
        """Return the best API key for the configured provider."""
        if self.llm_provider == "groq" and self.groq_api_key:
            return self.groq_api_key
        if self.llm_provider == "gemini" and self.gemini_api_key:
            return self.gemini_api_key
        return self.llm_api_key

    @property
    def effective_base_url(self) -> str:
        """Return the base URL for the configured provider."""
        provider_urls = {
            "groq": "https://api.groq.com/openai/v1",
            "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
            "ollama": self.ollama_base_url,
            "openai": "https://api.openai.com/v1",
        }
        # User's explicit llm_base_url overrides if it's not the old OpenAI default
        if self.llm_base_url and self.llm_base_url != "https://api.openai.com/v1":
            return self.llm_base_url
        return provider_urls.get(self.llm_provider, self.llm_base_url)


settings = Settings()