import os
from fastapi import FastAPI
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
    raise RuntimeError("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env")

app = FastAPI()

# Session cookie encryption key (dev only). Later we’ll put this into .env too.
app.add_middleware(SessionMiddleware, secret_key="dev-secret-change-me")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile",
    },
)

@app.get("/")
def root():
    return {"status": "ok", "app": "bandmanager"}

@app.get("/auth/google/login")
async def google_login(request):
    # redirects the user to Google’s login/consent screen
    return await oauth.google.authorize_redirect(request, GOOGLE_REDIRECT_URI)

@app.get("/auth/google/callback")
async def google_callback(request):
    # exchange code for tokens
    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")
    # store token in session for now (dev). Later: DB + refresh token.
    request.session["token"] = token
    request.session["user"] = user
    return JSONResponse({"logged_in": True, "user": user})

@app.get("/auth/me")
async def auth_me(request):
    user = request.session.get("user")
    if not user:
        return JSONResponse({"logged_in": False}, status_code=401)
    return JSONResponse({"logged_in": True, "user": user})

@app.get("/auth/logout")
async def auth_logout(request):
    request.session.clear()
    return RedirectResponse(url="/")