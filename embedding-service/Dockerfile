FROM python:3.9-slim

# Create a non-root user required by Hugging Face Spaces security sandbox (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:${PATH}"

WORKDIR /home/user/app

# Install python dependencies
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Run the pre-download script to cache the SentenceTransformer model inside the Docker image
COPY --chown=user:user download_model.py .
RUN python download_model.py

# Copy application source files
COPY --chown=user:user . .

# Expose port 7860 (Hugging Face default) and boot FastAPI
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
