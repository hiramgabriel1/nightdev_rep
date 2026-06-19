# Security & Privacy

## Our Commitment

At Nightdev, we take your privacy and security seriously.

## Data We Handle

- **API Keys** (providers such as Anthropic, OpenAI, etc.) — stored securely and used exclusively to process your requests through your chosen model.
- **Telegram Tokens** — used only for bot authentication.
- **GitHub Repositories** — used only to push code you requested.

## What We Do NOT Do

- We do **not** store or inspect your source code.
- We do **not** share your API keys with third parties.
- We do **not** use your data to train models.
- We do **not** expose your credentials in logs or responses (they are automatically redacted).

## Infrastructure

- Each user runs in an **isolated Docker container**.
- No file sharing between containers.
- Communication between the bot and the bridge uses an internal authentication token.
- SSH access to the server is restricted to public key authentication.

## Reporting a Security Issue

If you find a vulnerability, please open an issue in the repository or contact the maintainers directly.
