---
title: RAG Embedding Service
emoji: 📄
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 4.41.0
app_file: app.py
pinned: false
---

# RAG Embedding and Extraction Microservice

This is a FastAPI-based AI utility microservice running on Hugging Face Spaces. 
It processes digital PDF documents and generates high-accuracy semantic embeddings using:
- **Model:** `BAAI/bge-base-en-v1.5` (768 dimensions)
- **PDF Library:** `PyMuPDF` (fast text extraction)
