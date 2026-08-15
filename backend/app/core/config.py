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
    llm_api_key: str
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_embedding_model: str = "text-embedding-3-small"
    github_webhook_secret: str = "dev-webhook-secret"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()