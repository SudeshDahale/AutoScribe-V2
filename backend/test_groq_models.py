import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

try:
    models = client.models.list()
    print("Available Groq Models:")
    for m in models.data:
        print(" -", m.id)
except Exception as e:
    print("Failed to list models:", e)
