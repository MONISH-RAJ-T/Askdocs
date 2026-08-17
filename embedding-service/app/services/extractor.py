import fitz  # PyMuPDF
import base64
import os
import io
import re
import time
from PIL import Image
import google.generativeai as genai
from groq import Groq
from app.prompts import VISION_OCR_SYSTEM_PROMPT

from typing import Generator

# Months used for date-based section detection
_MONTHS = r"(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"

# Matches: "February 2025", "Feb 2025", "2025 February", "AUGUST 2026"
_DATE_PATTERN = re.compile(
    rf"{_MONTHS}\s+\d{{4}}|\d{{4}}\s+{_MONTHS}",
    re.IGNORECASE
)

# Matches: "Chapter 3", "Chapter III", "Chapter One", "UNIT IV", "Section B", "PART 2", "ACT I", "SCENE 1"
_SECTION_PATTERN = re.compile(
    r"^(chapter|unit|section|part|module|act|scene)\s+([\dIVXivx]+|[a-zA-Z]+)",
    re.IGNORECASE | re.MULTILINE
)


def detect_section_header(text: str) -> str | None:
    """
    Conservatively detects whether a page contains a document section boundary.
    Returns a short label string if a boundary is found, otherwise returns None.
    Rules:
    - Must contain a month+year date pattern (e.g., 'Feb 2025'), OR
    - Must start with a Section/Chapter/Unit/Part heading on a short line (< 10 words)
    """
    # Rule 1: date-based boundary (e.g., exam month/year)
    date_match = _DATE_PATTERN.search(text)
    if date_match:
        return date_match.group(0).strip().title()

    # Rule 2: structural heading boundary (Chapter X, UNIT IV, etc.)
    for line in text.splitlines():
        line = line.strip()
        if line and len(line.split()) <= 10 and _SECTION_PATTERN.match(line):
            return line.strip().title()

    return None

def extract_text_from_pdf_bytes(pdf_bytes: bytes, groq_api_key: str | None = None, document_id: str | None = None, char_limit: int = 50000) -> Generator[list[dict], None, None]:
    """
    Extracts text from PDF bytes page-by-page.
    Yields batches of pages dynamically when the accumulated character count exceeds char_limit.
    Uses PyMuPDF for digital text and Groq Vision OCR for scanned pages (batched up to 4 pages per request).
    """
    # Open the PDF document from memory bytes
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    
    # Initialize Groq client if key is provided
    groq_client = None
    if groq_api_key:
        try:
            # Set timeout and limit retries to prevent background thread from hanging on rate limits
            groq_client = Groq(api_key=groq_api_key, max_retries=1, timeout=30.0)
        except Exception as e:
            print(f"[OCR ERROR] Failed to initialize Groq client: {str(e)}")

    # Initialize Gemini client configuration
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    gemini_available = False
    if gemini_api_key:
        try:
            genai.configure(api_key=gemini_api_key)
            gemini_available = True
        except Exception as e:
            print(f"[OCR ERROR] Failed to configure Gemini: {str(e)}")

    current_batch = []
    current_batch_chars = 0
    
    # Tracks the active document section (e.g. exam date, chapter name)
    current_section: str | None = None
    
    image_buffer = []
    image_page_numbers = []
    image_buffer_sections: list[str | None] = []  # tracks section per buffered image

    def flush_image_buffer():
        nonlocal current_batch_chars
        if not image_buffer:
            return
            
        def process_images_recursive(imgs, p_nums):
            nonlocal current_batch_chars, current_section
            if not imgs: return
            
            # Step 1: Try Gemini Vision OCR first if available
            if gemini_available:
                print(f"[OCR] Processing batch of {len(imgs)} scanned pages with Gemini for document {document_id or ''}...")
                try:
                    model = genai.GenerativeModel('gemini-2.5-flash')
                    # Format as list: Prompt first, then PIL Image objects
                    response = model.generate_content([VISION_OCR_SYSTEM_PROMPT] + imgs)
                    ocr_text = response.text.strip()
                    
                    if ocr_text:
                        pages_str = ", ".join(map(str, p_nums))
                        print(f"[OCR SUCCESS] Batch of pages {pages_str} transcribed via Gemini ({len(ocr_text)} chars)")
                        
                        # Parse pages using start/end page delimiters
                        page_pattern = re.compile(r'--- START PAGE (\d+) ---\s*(.*?)\s*--- END PAGE \1 ---', re.DOTALL | re.IGNORECASE)
                        matches = page_pattern.findall(ocr_text)
                        
                        pages_extracted = {}
                        for page_num_str, page_content in matches:
                            pages_extracted[int(page_num_str)] = page_content.strip()
                        
                        # Loop through pages in the batch individually to maintain page counts
                        for idx, p_num in enumerate(p_nums):
                            # Look up content by relative index (1-based) or absolute page number
                            page_text = pages_extracted.get(idx + 1) or pages_extracted.get(p_num)
                            
                            # Robust fallback: if delimiters are missing, divide character count equally
                            if page_text is None:
                                if not pages_extracted:
                                    chunk_size = len(ocr_text) // len(imgs)
                                    page_text = ocr_text[idx*chunk_size : (idx+1)*chunk_size]
                                else:
                                    page_text = ""
                            
                            page_text = page_text.strip()
                            
                            # Check section boundary
                            detected = detect_section_header(page_text)
                            if detected:
                                current_section = detected
                                print(f"[SECTION] Detected new section: '{current_section}' on page {p_num}")
                                
                            current_batch.append({
                                "page_number": p_num,
                                "text": page_text,
                                "section": current_section
                            })
                            current_batch_chars += len(page_text)
                        
                        return # Success!
                    else:
                        print(f"[OCR WARNING] Gemini returned empty transcription for pages {p_nums}. Falling back to Groq...")
                except Exception as gemini_err:
                    error_msg = str(gemini_err)
                    print(f"[OCR WARNING] Gemini execution failed for pages {p_nums}: {error_msg}")
                    # If Gemini fails due to rate limit (429) or payload too large (413), retry with a smaller batch size in Gemini
                    if ("quota" in error_msg.lower() or "limit" in error_msg.lower() or "too large" in error_msg.lower() or "429" in error_msg or "413" in error_msg) and len(imgs) > 1:
                        new_size = len(imgs) - 1
                        print(f"[OCR RETRY] Gemini batch too large or rate limited. Retrying with {new_size} pages...")
                        time.sleep(2)
                        process_images_recursive(imgs[:new_size], p_nums[:new_size])
                        process_images_recursive(imgs[new_size:], p_nums[new_size:])
                        return
                    # Otherwise, proceed to Groq fallback
                    print(f"[OCR INFO] Gemini failed with unrecoverable error. Falling back to Groq...")

            # Step 2: Fall back to Groq Vision OCR
            if groq_client:
                print(f"[OCR] Processing batch of {len(imgs)} scanned pages with Groq fallback for document {document_id or ''}...")
                
                # Format PIL images to Groq base64 structures
                content_array = [{"type": "text", "text": VISION_OCR_SYSTEM_PROMPT}]
                for img in imgs:
                    buffered = io.BytesIO()
                    img.save(buffered, format="JPEG")
                    base64_image = base64.b64encode(buffered.getvalue()).decode("utf-8")
                    content_array.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    })
                
                try:
                    response = groq_client.chat.completions.create(
                        model="qwen/qwen3.6-27b",
                        messages=[{"role": "user", "content": content_array}],
                        temperature=0.1,
                        max_tokens=2048
                    )
                    
                    ocr_text = response.choices[0].message.content.strip()
                    if ocr_text:
                        pages_str = ", ".join(map(str, p_nums))
                        print(f"[OCR SUCCESS] Batch of pages {pages_str} transcribed successfully via Groq fallback ({len(ocr_text)} chars)")
                        
                        # Parse pages using start/end page delimiters
                        page_pattern = re.compile(r'--- START PAGE (\d+) ---\s*(.*?)\s*--- END PAGE \1 ---', re.DOTALL | re.IGNORECASE)
                        matches = page_pattern.findall(ocr_text)
                        
                        pages_extracted = {}
                        for page_num_str, page_content in matches:
                            pages_extracted[int(page_num_str)] = page_content.strip()
                        
                        # Loop through pages in the batch individually to maintain page counts
                        for idx, p_num in enumerate(p_nums):
                            # Look up content by relative index (1-based) or absolute page number
                            page_text = pages_extracted.get(idx + 1) or pages_extracted.get(p_num)
                            
                            # Robust fallback: if delimiters are missing, divide character count equally
                            if page_text is None:
                                if not pages_extracted:
                                    chunk_size = len(ocr_text) // len(imgs)
                                    page_text = ocr_text[idx*chunk_size : (idx+1)*chunk_size]
                                else:
                                    page_text = ""
                            
                            page_text = page_text.strip()
                            
                            # Check section boundary
                            detected = detect_section_header(page_text)
                            if detected:
                                current_section = detected
                                print(f"[SECTION] Detected new section: '{current_section}' on page {p_num}")
                                
                            current_batch.append({
                                "page_number": p_num,
                                "text": page_text,
                                "section": current_section
                            })
                            current_batch_chars += len(page_text)
                            
                        return # Success!
                    else:
                        print(f"[OCR WARNING] Groq fallback returned empty transcription.")
                except Exception as groq_err:
                    error_msg = str(groq_err)
                    print(f"[OCR ERROR] Failed Groq Vision OCR on pages {p_nums}: {error_msg}")
                    # If Groq fails because batch is too large, recursively split
                    if ("413" in error_msg or "too large" in error_msg.lower() or "tokens per minute" in error_msg.lower() or "rate_limit_exceeded" in error_msg or "supports up to" in error_msg.lower()) and len(imgs) > 1:
                        new_size = len(imgs) - 1
                        print(f"[OCR RETRY] Batch too large. Retrying with {new_size} pages...")
                        time.sleep(2)
                        process_images_recursive(imgs[:new_size], p_nums[:new_size])
                        process_images_recursive(imgs[new_size:], p_nums[new_size:])
                        return
            
            # If both fail or are unavailable, append empty text
            for p_num in p_nums:
                current_batch.append({
                    "page_number": p_num,
                    "text": ""
                })

        process_images_recursive(image_buffer, image_page_numbers)
        
        image_buffer.clear()
        image_page_numbers.clear()

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_index = page_num + 1
        
        # 1. Try standard digital text extraction first
        text = page.get_text("text").strip()
        
        # 2. Check if page text is too short, indicating an image/scanned page
        is_digital = len(text) > 50
        
        if is_digital:
            # Flush pending images before processing the digital page to maintain reading order
            if image_buffer:
                flush_image_buffer()
            
            # Detect section boundary on this digital page
            detected = detect_section_header(text)
            if detected:
                current_section = detected
                print(f"[SECTION] Detected new section: '{current_section}' on page {page_index}")
                
            print(f"[INFO] Page {page_index} of document {document_id or ''}: Using digital text extraction ({len(text)} chars)")
            current_batch.append({
                "page_number": page_index,
                "text": text,
                "section": current_section
            })
            current_batch_chars += len(text)
        else:
            # Page is an image. Add to buffer if Gemini or Groq is available
            if gemini_available or groq_client:
                # Render page to JPEG bytes in memory (150 DPI is crisp enough for OCR)
                pix = page.get_pixmap(dpi=150)
                image_bytes = pix.tobytes("jpeg")
                pil_img = Image.open(io.BytesIO(image_bytes))
                
                image_buffer.append(pil_img)
                image_page_numbers.append(page_index)
                
                # Gemini handles larger batches (up to 8). If only Groq is available, limit to 3.
                batch_limit = 8 if gemini_available else 3
                if len(image_buffer) >= batch_limit:
                    flush_image_buffer()
            else:
                print(f"[WARNING] Page {page_index} of document {document_id or ''} is image-only, but no Gemini/Groq API Key was provided. Skipping OCR.")
                current_batch.append({
                    "page_number": page_index,
                    "text": text
                })
                current_batch_chars += len(text)
        
        # If batch char limit reached, yield and clear
        if current_batch_chars >= char_limit:
            # Ensure pending images are flushed before we check the limit again
            if image_buffer:
                flush_image_buffer()
                
            if current_batch:
                yield current_batch
                current_batch = []
                current_batch_chars = 0

    # Flush any remaining images at the end of the document
    if image_buffer:
        flush_image_buffer()

    # Yield any remaining pages in the final batch
    if current_batch:
        yield current_batch
        
    doc.close()
