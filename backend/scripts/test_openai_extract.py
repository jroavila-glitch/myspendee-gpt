import argparse
import base64
import os
from pathlib import Path

from openai import OpenAI

from app.services.openai_extraction import EXTRACTION_PROMPT


def main() -> None:
    parser = argparse.ArgumentParser(description="Run GPT extraction against a rendered statement page image.")
    parser.add_argument("image_path")
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--max-tokens", type=int, default=4000)
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required")

    image_bytes = Path(args.image_path).read_bytes()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=args.model,
        max_tokens=args.max_tokens,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    )
    print(response.choices[0].message.content)


if __name__ == "__main__":
    main()
