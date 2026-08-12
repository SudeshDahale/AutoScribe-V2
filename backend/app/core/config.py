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

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()