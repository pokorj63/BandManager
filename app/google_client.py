from __future__ import annotations

from typing import Optional
from googleapiclient.http import MediaIoBaseUpload
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




def _find_folder_id(drv, parent_id: str, name: str) -> Optional[str]:
    q = (
        f"mimeType='application/vnd.google-apps.folder' "
        f"and name='{name}' "
        f"and '{parent_id}' in parents "
        f"and trashed=false"
    )
    res = drv.files().list(q=q, fields="files(id,name)", pageSize=10).execute()
    files = res.get("files", [])
    return files[0]["id"] if files else None

def _ensure_folder(drv, parent_id: str, name: str) -> str:
    existing = _find_folder_id(drv, parent_id, name)
    if existing:
        return existing
    created = drv.files().create(
        body={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
        fields="id",
    ).execute()
    return created["id"]

def ensure_media_subfolders(drv, event_drive_folder_id: str) -> dict[str, str]:
    media_id = _ensure_folder(drv, event_drive_folder_id, "Media")
    photos_id = _ensure_folder(drv, media_id, "Photos")
    videos_id = _ensure_folder(drv, media_id, "Videos")
    return {"media": media_id, "photos": photos_id, "videos": videos_id}

def upload_file_to_drive(drv, folder_id: str, upload_file, filename: str, mime_type: str) -> dict:
    media = MediaIoBaseUpload(upload_file, mimetype=mime_type, resumable=False)
    created = drv.files().create(
        body={"name": filename, "parents": [folder_id]},
        media_body=media,
        fields="id,name,mimeType,size",
    ).execute()
    return created