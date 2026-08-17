import os
from sentence_transformers import SentenceTransformer

def download():
    print("Pre-downloading BAAI/bge-base-en-v1.5 model...")
    # Force loading it so it downloads files into the standard cache directory
    SentenceTransformer('BAAI/bge-base-en-v1.5')
    print("Model downloaded successfully!")

if __name__ == "__main__":
    download()
