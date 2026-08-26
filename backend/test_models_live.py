import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

candidate_models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
]

print("Testing Candidate Models on Groq:")
for m in candidate_models:
    try:
        resp = client.chat.completions.create(
            model=m,
            messages=[{"role": "user", "content": "hello"}],
            max_tokens=10,
        )
        print(f" -> [WORKING]: {m}")
    except Exception as e:
        print(f" -> [FAILED]: {m} -> {e}")
