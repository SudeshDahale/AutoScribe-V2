from cryptography.fernet import Fernet

from app.core.config import settings

_fernet = Fernet(settings.fernet_key.encode())


def encrypt_token(raw: str) -> str:
    return _fernet.encrypt(raw.encode()).decode()


def decrypt_token(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()