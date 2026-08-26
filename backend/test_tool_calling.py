import os
import json
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

models_to_test = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "groq/compound",
]

print("Testing Structured Tool Calls on Available Models:")
for m in models_to_test:
    try:
        resp = client.chat.completions.create(
            model=m,
            messages=[
                {"role": "system", "content": "You are a code analyzer. Return JSON matching the tool schema."},
                {"role": "user", "content": "Analyze AutoScribe repository."},
            ],
            tools=[{
                "type": "function",
                "function": {
                    "name": "save_architecture",
                    "description": "Save architecture analysis",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "understanding_score": {"type": "integer"},
                            "rationale": {"type": "string"},
                            "tech_stack": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["understanding_score", "rationale", "tech_stack"],
                    },
                },
            }],
            tool_choice={"type": "function", "function": {"name": "save_architecture"}},
            max_tokens=500,
        )
        call = resp.choices[0].message.tool_calls[0]
        args = json.loads(call.function.arguments)
        print(f" -> [SUCCESS on {m}]: {args}")
    except Exception as e:
        print(f" -> [FAILED on {m}]: {e}")
