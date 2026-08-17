import jwt
import base64
from fastapi import Header, HTTPException, status
from supabase import create_client, Client
from app.config import settings
from app.models.user import User

# Configure JWK client for asymmetric (RS256) token verification
# Retrieves public keys from your Supabase project's auth server
jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
jwk_client = jwt.PyJWKClient(jwks_url)

class AuthService:
    def __init__(self):
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_key)

    def signup(self, email: str, password: str):
        try:
            response = self.client.auth.sign_up({
                "email": email,
                "password": password
            })
            if not response.user:
                raise ValueError("Registration succeeded but no user object was returned.")
            return response
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Signup failed: {str(e)}"
            )

    def login(self, email: str, password: str):
        try:
            response = self.client.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            if not response.session:
                raise ValueError("Credentials valid but no active session was returned.")
            return response
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Login failed: {str(e)}"
            )

def get_current_user(authorization: str = Header(None)) -> User:
    """
    FastAPI dependency that decodes and validates the Supabase JWT.
    Auto-detects whether the token is signed symmetrically (HS256)
    or asymmetrically (RS256/ES256) and verifies it accordingly.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid token. Expected header format: 'Bearer <token>'"
        )
    token = authorization.split(" ")[1]
    try:
        # Detect token signature algorithm from JWT header
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            # Symmetric verification using project JWT Secret
            # Decodes the base64 secret to raw bytes (required for standard Supabase HS256 signatures)
            try:
                # Add padding just in case the secret doesn't have valid base64 padding
                padded_secret = settings.supabase_jwt_secret + "=" * ((4 - len(settings.supabase_jwt_secret) % 4) % 4)
                secret_key = base64.b64decode(padded_secret)
            except Exception:
                secret_key = settings.supabase_jwt_secret.encode('utf-8')

            payload = jwt.decode(
                token,
                secret_key,
                algorithms=["HS256"],
                audience="authenticated"
            )
        else:
            # Asymmetric verification (RS256 / ES256) using JWKS public keys
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience="authenticated"
            )

        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token claims payload missing user ID (sub)."
            )
        return User(id=user_id, email=email)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token has expired. Please log in again."
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid credentials token structure: {str(e)}"
        )
