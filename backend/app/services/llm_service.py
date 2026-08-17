import json
import google.generativeai as genai
from groq import Groq
from app.config import settings
from app.prompts import RAG_SYSTEM_PROMPT

class LLMService:
    def __init__(self):
        self.groq_client = Groq(api_key=settings.groq_api_key)
        self.groq_model = "llama-3.1-8b-instant"
        
        # Configure Gemini if API Key is available
        self.gemini_available = False
        if settings.gemini_api_key:
            try:
                genai.configure(api_key=settings.gemini_api_key)
                self.gemini_available = True
            except Exception as e:
                print(f"[LLM ERROR] Failed to configure Gemini: {str(e)}")

    def generate_streaming_response(self, context_chunks: list[str], question: str, history: list[dict]):
        """
        Creates a streaming generator that queries Groq with RAG context (primary)
        and formats tokens into Server-Sent Events (SSE), falling back to Gemini if Groq fails.
        """
        groq_failed = False
        tokens_yielded = 0

        # 1. Attempt Groq (Llama-3.1) first
        # Groq has a strict 6,000 TPM limit. Trim to max 4 pages, and truncate each page to 5000 chars
        # Budget: ~1000 (system prompt) + 4 pages × 1250 tokens ≈ ~6000 tokens maximum limit
        try:
            print("[LLM] Streaming answer via Groq (primary)...")
            groq_context_chunks = context_chunks[:4]
            truncated_chunks = [c[:5000] for c in groq_context_chunks]
            groq_context_str = "\n\n".join([f"Context Block {i+1}:\n{content}" for i, content in enumerate(truncated_chunks)])
            groq_system_content = RAG_SYSTEM_PROMPT.format(context=groq_context_str)
            
            messages = [{"role": "system", "content": groq_system_content}]
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": question})

            stream = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=messages,
                temperature=0.3,
                max_tokens=1024,
                frequency_penalty=0.5,
                presence_penalty=0.1,
                stream=True
            )

            # Stream tokens to the client
            for chunk in stream:
                token = chunk.choices[0].delta.content
                if token:
                    yield f"data: {json.dumps({'token': token})}\n\n"
                    tokens_yielded += 1

            yield "data: [DONE]\n\n"
            return # Successfully streamed from Groq

        except Exception as e:
            print(f"[LLM WARNING] Groq primary streaming failed: {str(e)}")
            if tokens_yielded > 0:
                # If we've already started streaming to the client, we cannot cleanly fallback mid-stream.
                # Report the error instead.
                err_msg = json.dumps({"error": f"Groq streaming interrupted: {str(e)}"})
                yield f"data: {err_msg}\n\n"
                yield "data: [DONE]\n\n"
                return
            else:
                groq_failed = True

        # 2. Fall back to Gemini 2.5 Flash if available
        if groq_failed:
            if self.gemini_available:
                try:
                    print("[LLM] Falling back to Gemini (gemini-2.5-flash)...")
                    # Format the system prompt template with full database chunks
                    context_str = "\n\n".join([f"Context Block {i+1}:\n{content}" for i, content in enumerate(context_chunks)])
                    system_content = RAG_SYSTEM_PROMPT.format(context=context_str)

                    safety_settings = [
                        {
                            "category": "HARM_CATEGORY_HARASSMENT",
                            "threshold": "BLOCK_NONE",
                        },
                        {
                            "category": "HARM_CATEGORY_HATE_SPEECH",
                            "threshold": "BLOCK_NONE",
                        },
                        {
                            "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            "threshold": "BLOCK_NONE",
                        },
                        {
                            "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                            "threshold": "BLOCK_NONE",
                        },
                    ]
                    
                    model = genai.GenerativeModel(
                        model_name='gemini-2.5-flash',
                        system_instruction=system_content,
                        safety_settings=safety_settings
                    )
                    
                    # Format chat history for Google SDK (alternating user/model)
                    gemini_contents = []
                    for msg in history:
                        role = "user" if msg["role"] == "user" else "model"
                        gemini_contents.append({
                            "role": role,
                            "parts": [msg["content"]]
                        })
                    
                    # Append current question
                    gemini_contents.append({
                        "role": "user",
                        "parts": [question]
                    })
                    
                    generation_config = genai.types.GenerationConfig(
                        temperature=0.3,
                        max_output_tokens=4096,
                    )
                    
                    stream = model.generate_content(
                        contents=gemini_contents,
                        generation_config=generation_config,
                        stream=True
                    )
                    
                    for chunk in stream:
                        try:
                            token = chunk.text
                            if token:
                                yield f"data: {json.dumps({'token': token})}\n\n"
                        except Exception:
                            pass
                            
                    yield "data: [DONE]\n\n"
                    return # Successfully streamed from Gemini fallback
                    
                except Exception as gemini_err:
                    print(f"[LLM ERROR] Gemini fallback failed: {str(gemini_err)}")
                    err_msg = json.dumps({"error": f"LLM inference failed. Primary (Groq) and Fallback (Gemini) both failed. Gemini error: {str(gemini_err)}"})
                    yield f"data: {err_msg}\n\n"
                    yield "data: [DONE]\n\n"
            else:
                print("[LLM ERROR] Groq failed and Gemini is not configured/available.")
                err_msg = json.dumps({"error": "Primary LLM (Groq) failed, and Gemini fallback is not configured."})
                yield f"data: {err_msg}\n\n"
                yield "data: [DONE]\n\n"
