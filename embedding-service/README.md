---
title: RAG Embedding Service
emoji: 📄
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# RAG Embedding and Extraction Microservice

This is a FastAPI-based AI utility microservice running on Hugging Face Spaces. 
It processes digital PDF documents and generates high-accuracy semantic embeddings using:
- **Model:** `BAAI/bge-base-en-v1.5` (768 dimensions)
- **PDF Library:** `PyMuPDF` (fast text extraction)
