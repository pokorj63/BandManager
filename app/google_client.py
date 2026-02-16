import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
]


def get_credentials_from_session(token: dict) -> Credentials:
    # Authlib token usually contains:
    # access_token, refresh_token, expires_at, token_type, scope
    return Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=GOOGLE_SCOPES,
    )


def calendar_service(creds: Credentials):
    return build("calendar", "v3", credentials=creds)


def drive_service(creds: Credentials):
    return build("drive", "v3", credentials=creds)