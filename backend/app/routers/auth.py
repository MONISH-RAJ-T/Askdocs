from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import SignUpRequest, LoginRequest, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])
auth_service = AuthService()

@router.post("/signup")
def signup(payload: SignUpRequest):
    """
    Registers a new user using Supabase Auth.
    If email confirmation is enabled on Supabase, the session will be null
    and the user must click the verification link in their email first.
    """
    response = auth_service.signup(payload.email, payload.password)
    session = response.session
    if not session:
        return {
            "message": "Signup successful. Verification email sent.",
            "user_id": response.user.id,
            "session_active": False
        }
    return {
        "message": "Signup successful.",
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "token_type": "bearer",
        "user_id": response.user.id,
        "session_active": True
    }

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    """
    Logs in an existing user and returns JWT session tokens.
    """
    response = auth_service.login(payload.email, payload.password)
    session = response.session
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        token_type="bearer",
        user_id=response.user.id
    )
