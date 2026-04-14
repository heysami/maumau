---
summary: "Which brain or search provider to choose during onboarding, with prep steps before you click"
read_when:
  - Choosing a model provider during macOS onboarding
  - Choosing a search provider during onboarding
  - You want to know what account, billing, key, or sign-in step you need before setup
title: "Choose Providers"
sidebarTitle: "Choose Providers"
---

# Choose Providers

Use this page before you pick a **brain** or **search provider** in onboarding.
It mirrors the embedded macOS onboarding order: easiest and most common choices first,
then more specialized or self-hosted paths after that.

<Info>
If you want the lowest-friction start, pick one of these first:

1. **OpenAI Codex (ChatGPT OAuth)** if you already use ChatGPT
2. **Anthropic API key** if you already use Claude API
3. **Gemini API key** if you already use Google AI Studio
4. **Ollama** if you want local models and no cloud API key
5. **OpenRouter API key** if you want one key for many model brands
   </Info>

## Brain providers

### OpenAI

#### OpenAI Codex (ChatGPT OAuth)

**Best for:** the easiest OpenAI setup if you already use ChatGPT.

**What you need:** a ChatGPT account and a browser sign-in. No API key.

**How to get it:**

1. Go to [ChatGPT](https://chatgpt.com/) and sign in.
2. Make sure the browser on this Mac is signed in to the account you want Maumau to use.
3. In onboarding, choose `OpenAI` and then `OpenAI Codex (ChatGPT OAuth)`.
4. Approve the browser sign-in when Maumau opens it.

**Links:** [OpenAI provider docs](/providers/openai)

#### OpenAI API key

**Best for:** API billing, automation, and project-scoped usage.

**What you need:** an OpenAI Platform account with billing enabled.

**How to get it:**

1. Go to [OpenAI Platform API keys](https://platform.openai.com/api-keys).
2. Sign in or create an OpenAI Platform account.
3. Add a payment method if your workspace does not already have billing.
4. Create a new secret API key.
5. Copy it once, then return to onboarding and paste it into Maumau.

**Links:** [OpenAI provider docs](/providers/openai)

### Anthropic

#### Anthropic API key

**Best for:** standard Claude API usage and the smoothest Anthropic setup in Maumau.

**What you need:** an Anthropic Console account and API billing access.

**How to get it:**

1. Go to [Anthropic Console keys](https://console.anthropic.com/settings/keys).
2. Sign in or create an Anthropic Console account.
3. Add billing if your workspace requires it.
4. Create an API key.
5. Return to onboarding and paste the key into Maumau.

**Links:** [Anthropic provider docs](/providers/anthropic)

#### Claude setup-token

**Best for:** using a Claude subscription instead of API billing.

**What you need:** a Claude account and the Claude Code CLI on any machine.

**How to get it:**

1. Install Claude Code from [Claude download](https://claude.ai/download).
2. Sign in to your Claude account in Claude Code.
3. Run `claude setup-token`.
4. Copy the token it prints.
5. Return to onboarding and paste that token into Maumau.

**Links:** [Anthropic provider docs](/providers/anthropic)

### Google

#### Gemini API key

**Best for:** the recommended Google setup for most people.

**What you need:** a Google account with Google AI Studio access.

**How to get it:**

1. Go to [Google AI Studio API keys](https://aistudio.google.com/apikey).
2. Sign in with the Google account you want to use.
3. Create a Gemini API key.
4. Return to onboarding and paste the key into Maumau.

**Links:** [Google provider docs](/providers/google)

#### Gemini CLI OAuth

**Best for:** Gemini CLI users who specifically want OAuth instead of an API key.

**What you need:** a Google account plus Gemini CLI OAuth client setup.

**How to get it:**

1. Set up Gemini CLI first from the [Gemini CLI project](https://github.com/google-gemini/gemini-cli).
2. Make sure its OAuth client settings are already configured.
3. In onboarding, choose the Gemini CLI OAuth method.
4. Complete the browser sign-in flow when Maumau opens it.

**Links:** [Google provider docs](/providers/google)

### Ollama

#### Ollama local runtime

**Best for:** running open models locally without a cloud API key.

**What you need:** Ollama installed on this Mac and at least one model pulled locally.

**How to get it:**

1. Install Ollama from [Ollama download](https://ollama.com/download).
2. Start the Ollama app or daemon.
3. Pull a model in Terminal, for example `ollama pull llama3.1`.
4. Return to onboarding and choose `Ollama`.

**Links:** [Ollama provider docs](/providers/ollama)

### OpenRouter

#### OpenRouter API key

**Best for:** trying many model providers behind one API key.

**What you need:** an OpenRouter account and API credits.

**How to get it:**

1. Go to [OpenRouter keys](https://openrouter.ai/keys).
2. Sign in or create an OpenRouter account.
3. Add credits if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [OpenRouter provider docs](/providers/openrouter)

### Chutes

#### Chutes OAuth

**Best for:** the easiest Chutes setup because it starts in your browser.

**What you need:** a Chutes account and browser access.

**How to get it:**

1. Go to [Chutes](https://chutes.ai/) and sign in or create an account.
2. In onboarding, choose `Chutes (OAuth)`.
3. Finish the browser sign-in flow when Maumau opens it.

#### Chutes API key

**Best for:** direct API-key automation without the browser flow.

**What you need:** a Chutes account and an API key from its dashboard.

**How to get it:**

1. Go to [Chutes](https://chutes.ai/) and sign in.
2. Open the API or dashboard area.
3. Create a new API key.
4. Return to onboarding and paste it into Maumau.

### Qwen

#### Qwen OAuth

**Best for:** a simple Qwen browser sign-in flow.

**What you need:** a Qwen account and browser access.

**How to get it:**

1. Go to [Qwen Chat](https://chat.qwen.ai/) and sign in or create an account.
2. In onboarding, choose `Qwen`.
3. Complete the OAuth flow when Maumau opens it.

**Links:** [Qwen provider docs](/providers/qwen)

### Qwen (Alibaba Cloud Model Studio)

#### Model Studio Standard API key (Global)

**Best for:** global pay-as-you-go access on Alibaba Cloud Model Studio.

**What you need:** an Alibaba Cloud account with Model Studio enabled.

**How to get it:**

1. Open [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/).
2. Sign in and activate Model Studio if needed.
3. Create a Standard API key for the global endpoint.
4. Return to onboarding and paste it into Maumau.

**Links:** [Model Studio provider docs](/providers/modelstudio)

#### Model Studio Coding Plan API key (Global)

**Best for:** global subscription access through the Coding Plan endpoint.

**What you need:** an Alibaba Cloud account with a Coding Plan subscription.

**How to get it:**

1. Open [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/).
2. Subscribe to the Coding Plan if needed.
3. Create a Coding Plan API key for the global endpoint.
4. Return to onboarding and paste it into Maumau.

**Links:** [Model Studio provider docs](/providers/modelstudio)

#### Model Studio Standard API key (China)

**Best for:** China-region pay-as-you-go access on Alibaba Cloud Model Studio.

**What you need:** an Alibaba Cloud China account with Model Studio enabled.

**How to get it:**

1. Open [Alibaba Cloud Model Studio (China)](https://help.aliyun.com/zh/model-studio/).
2. Activate the service if needed.
3. Create a Standard API key for the China endpoint.
4. Return to onboarding and paste it into Maumau.

**Links:** [Model Studio provider docs](/providers/modelstudio)

#### Model Studio Coding Plan API key (China)

**Best for:** China-region subscription access through the Coding Plan endpoint.

**What you need:** an Alibaba Cloud China account with a Coding Plan subscription.

**How to get it:**

1. Open [Alibaba Cloud Model Studio (China)](https://help.aliyun.com/zh/model-studio/).
2. Subscribe to the Coding Plan if needed.
3. Create a Coding Plan API key for the China endpoint.
4. Return to onboarding and paste it into Maumau.

**Links:** [Model Studio provider docs](/providers/modelstudio)

### MiniMax

#### MiniMax API key (Global)

**Best for:** the cleanest MiniMax setup for international users who want API billing.

**What you need:** a MiniMax account on the global platform and an API key.

**How to get it:**

1. Go to [MiniMax global platform](https://platform.minimax.io/).
2. Sign in or create an account.
3. Enable the API or add billing if needed.
4. Create a global API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [MiniMax provider docs](/providers/minimax)

#### MiniMax OAuth (Global)

**Best for:** global MiniMax Coding Plan users who prefer sign-in over pasted keys.

**What you need:** a MiniMax global account with the Coding Plan flow available.

**How to get it:**

1. Sign in to [MiniMax global platform](https://platform.minimax.io/).
2. Make sure your Coding Plan access is active.
3. In onboarding, choose the global MiniMax OAuth method.
4. Finish the browser sign-in flow.

**Links:** [MiniMax provider docs](/providers/minimax)

#### MiniMax API key (China)

**Best for:** MiniMax API billing for China-region accounts.

**What you need:** a China-region MiniMax account and API key.

**How to get it:**

1. Go to [MiniMax China platform](https://platform.minimaxi.com/).
2. Sign in or create an account.
3. Enable the API or add billing if needed.
4. Create a China-region API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [MiniMax provider docs](/providers/minimax)

#### MiniMax OAuth (China)

**Best for:** China-region MiniMax Coding Plan users who want OAuth.

**What you need:** a China-region MiniMax account with Coding Plan access.

**How to get it:**

1. Sign in to [MiniMax China platform](https://platform.minimaxi.com/).
2. Make sure your Coding Plan access is active.
3. In onboarding, choose the China MiniMax OAuth method.
4. Finish the browser sign-in flow.

**Links:** [MiniMax provider docs](/providers/minimax)

### Moonshot AI (Kimi K2.5)

#### Moonshot API key (.ai)

**Best for:** international Moonshot / Kimi API access.

**What you need:** a Moonshot account on the `.ai` platform and an API key.

**How to get it:**

1. Go to [Moonshot `.ai` platform](https://platform.moonshot.ai/).
2. Sign in or create an account.
3. Enable billing if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Moonshot provider docs](/providers/moonshot)

#### Moonshot API key (.cn)

**Best for:** China-region Moonshot / Kimi API access.

**What you need:** a Moonshot account on the `.cn` platform and an API key.

**How to get it:**

1. Go to [Moonshot `.cn` platform](https://platform.moonshot.cn/).
2. Sign in or create an account.
3. Enable billing if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Moonshot provider docs](/providers/moonshot)

### Kimi Code

#### Kimi Code API key

**Best for:** people who specifically want Kimi's dedicated coding endpoint.

**What you need:** a Kimi Code subscription or API access plan.

**How to get it:**

1. Go to [Kimi](https://kimi.com/).
2. Sign in and make sure the coding plan or API access is active.
3. Create the coding API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Moonshot provider docs](/providers/moonshot)

### DeepSeek

#### DeepSeek API key

**Best for:** direct DeepSeek API usage.

**What you need:** a DeepSeek account and API credits.

**How to get it:**

1. Go to [DeepSeek API keys](https://platform.deepseek.com/api_keys).
2. Sign in or create an account.
3. Add credits if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [DeepSeek provider docs](/providers/deepseek)

### Mistral AI

#### Mistral API key

**Best for:** direct Mistral API usage.

**What you need:** a Mistral Console account and API key.

**How to get it:**

1. Go to [Mistral La Plateforme](https://console.mistral.ai/api-keys/).
2. Sign in or create an account.
3. Enable billing if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Mistral provider docs](/providers/mistral)

### xAI (Grok)

#### xAI API key

**Best for:** direct Grok API usage from xAI.

**What you need:** an xAI developer account and API key.

**How to get it:**

1. Go to [xAI console](https://console.x.ai/).
2. Sign in or create an account.
3. Make sure billing is ready if your plan requires it.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [xAI provider docs](/providers/xai)

### Hugging Face

#### Hugging Face token

**Best for:** using Hugging Face Inference with one HF token.

**What you need:** a Hugging Face account and a token with inference access.

**How to get it:**

1. Go to [Hugging Face tokens](https://huggingface.co/settings/tokens).
2. Sign in or create an account.
3. Create an access token.
4. Make sure your plan allows the inference endpoint you want.
5. Return to onboarding and paste the token into Maumau.

**Links:** [Hugging Face provider docs](/providers/huggingface)

### Together AI

#### Together AI API key

**Best for:** Together AI hosted open-model access.

**What you need:** a Together account and API credits.

**How to get it:**

1. Go to [Together API keys](https://api.together.ai/settings/api-keys).
2. Sign in or create an account.
3. Add credits if needed.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Together provider docs](/providers/together)

### BytePlus

#### BytePlus API key

**Best for:** BytePlus ModelArk access for supported hosted models.

**What you need:** a BytePlus account with ModelArk or API access.

**How to get it:**

1. Go to [BytePlus console](https://console.byteplus.com/).
2. Sign in or create an account.
3. Activate the model service you need.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

### Volcano Engine

#### Volcano Engine API key

**Best for:** Volcano Engine / Doubao API usage.

**What you need:** a Volcengine account with Ark access.

**How to get it:**

1. Go to [Volcengine console](https://console.volcengine.com/).
2. Sign in or create an account.
3. Open Ark or the API console.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Volcano Engine provider docs](/providers/volcengine)

### Qianfan

#### Qianfan API key

**Best for:** Baidu Qianfan hosted-model access.

**What you need:** a Baidu Intelligent Cloud account with Qianfan enabled.

**How to get it:**

1. Go to [Qianfan](https://qianfan.cloud.baidu.com/).
2. Sign in or create an account.
3. Activate the service if needed.
4. Generate the API credential the Maumau Qianfan provider expects.
5. Return to onboarding and paste it into Maumau.

**Links:** [Qianfan provider docs](/providers/qianfan)

### Z.AI

#### Z.AI API key

**Best for:** the plain Z.AI API key path when you do not need a region-specific variant.

**What you need:** a Z.AI account and API key.

**How to get it:**

1. Go to [Z.AI developer console](https://open.bigmodel.cn/).
2. Sign in or create an account.
3. Create an API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Z.AI provider docs](/providers/zai)

#### Z.AI Global

**Best for:** Z.AI Global API usage outside China.

**What you need:** a Z.AI account with the global endpoint enabled.

**How to get it:**

1. Go to [Z.AI developer console](https://open.bigmodel.cn/).
2. Sign in.
3. Create the API key for the global endpoint.
4. Return to onboarding and choose the Global option.

**Links:** [Z.AI provider docs](/providers/zai)

#### Z.AI Coding Plan (Global)

**Best for:** Z.AI Coding Plan users on the global endpoint.

**What you need:** a Z.AI Coding Plan account for the global region.

**How to get it:**

1. Go to [Z.AI developer console](https://open.bigmodel.cn/).
2. Subscribe to the Coding Plan if needed.
3. Create the global Coding Plan key.
4. Return to onboarding and choose the Coding Plan Global option.

**Links:** [Z.AI provider docs](/providers/zai)

#### Z.AI China

**Best for:** Z.AI API usage on the China endpoint.

**What you need:** a China-region Z.AI account and API key.

**How to get it:**

1. Go to [Z.AI developer console](https://open.bigmodel.cn/).
2. Sign in with the China-region account.
3. Create the China endpoint API key.
4. Return to onboarding and choose the CN option.

**Links:** [Z.AI provider docs](/providers/zai)

#### Z.AI Coding Plan (China)

**Best for:** Z.AI Coding Plan users on the China endpoint.

**What you need:** a China-region Z.AI Coding Plan account and key.

**How to get it:**

1. Go to [Z.AI developer console](https://open.bigmodel.cn/).
2. Subscribe to the China Coding Plan if needed.
3. Create the Coding Plan CN key.
4. Return to onboarding and choose the Coding Plan CN option.

**Links:** [Z.AI provider docs](/providers/zai)

### Xiaomi

#### Xiaomi API key

**Best for:** direct Xiaomi MiMo API access.

**What you need:** a Xiaomi AI platform account and API key.

**How to get it:**

1. Go to [Xiaomi platform](https://platform.xiaomi.com/).
2. Sign in or create an account.
3. Enable API access.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Xiaomi provider docs](/providers/xiaomi)

### Synthetic

#### Synthetic API key

**Best for:** a multi-model Anthropic-compatible hosted gateway.

**What you need:** a Synthetic account and API key.

**How to get it:**

1. Go to [Synthetic](https://synthetic.new/).
2. Sign in or create an account.
3. Make sure your project is active.
4. Create an API key.
5. Return to onboarding and paste it into Maumau.

**Links:** [Synthetic provider docs](/providers/synthetic)

### OpenCode

#### OpenCode Zen catalog

**Best for:** OpenCode's Zen catalog with its shared API key.

**What you need:** an OpenCode account and the shared API key for Zen and Go.

**How to get it:**

1. Go to [OpenCode](https://opencode.ai/).
2. Sign in or create an account.
3. Copy the shared API key.
4. Return to onboarding and choose `OpenCode Zen catalog`.

**Links:** [OpenCode Zen docs](/providers/opencode)

#### OpenCode Go catalog

**Best for:** OpenCode's Go catalog with the same shared API key.

**What you need:** an OpenCode account and the shared API key for Zen and Go.

**How to get it:**

1. Go to [OpenCode](https://opencode.ai/).
2. Sign in or create an account.
3. Copy the shared API key.
4. Return to onboarding and choose `OpenCode Go catalog`.

**Links:** [OpenCode Go docs](/providers/opencode-go)

### LiteLLM

#### LiteLLM API key

**Best for:** people already using a LiteLLM gateway in front of many providers.

**What you need:** a reachable LiteLLM endpoint, API key, and the model names your gateway exposes.

**How to get it:**

1. Start or locate your LiteLLM gateway.
2. Note the base URL, API key, and model names it exposes.
3. Return to onboarding and enter those values exactly.

**Links:** [LiteLLM provider docs](/providers/litellm)

### Custom Provider

#### Custom API-compatible endpoint

**Best for:** any OpenAI-compatible or Anthropic-compatible endpoint Maumau does not preconfigure.

**What you need:** a base URL, API key, model id, and knowledge of whether the endpoint speaks OpenAI or Anthropic format.

**How to get it:**

1. Collect the endpoint base URL from your provider or self-hosted gateway.
2. Create or copy the API key.
3. Confirm the exact model id and whether the endpoint is OpenAI-compatible or Anthropic-compatible.
4. Return to onboarding and enter the values exactly as given.

### Cloudflare AI Gateway

#### Cloudflare AI Gateway API key

**Best for:** routing model traffic through Cloudflare AI Gateway.

**What you need:** a Cloudflare account plus Account ID, Gateway ID, and API token or key.

**How to get it:**

1. Go to [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Create or open your AI Gateway.
3. Copy the Account ID and Gateway ID.
4. Create an API token or key that can use that gateway.
5. Return to onboarding and enter all three values.

**Links:** [Cloudflare AI Gateway docs](/providers/cloudflare-ai-gateway)

### Vercel AI Gateway

#### Vercel AI Gateway API key

**Best for:** routing supported providers through Vercel AI Gateway.

**What you need:** a Vercel account and AI Gateway API key.

**How to get it:**

1. Go to [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
2. Create or open your AI Gateway.
3. Generate the gateway API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Vercel AI Gateway docs](/providers/vercel-ai-gateway)

### Kilo Gateway

#### Kilo Gateway API key

**Best for:** people already using Kilo Gateway or OpenRouter-compatible Kilo routing.

**What you need:** a Kilo account and gateway API key.

**How to get it:**

1. Go to [Kilo Gateway](https://kilocode.ai/).
2. Sign in or create an account.
3. Create an API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Kilo provider docs](/providers/kilocode)

### Copilot

#### Copilot local proxy

**Best for:** using GitHub Copilot through a separate local proxy setup.

**What you need:** a GitHub account with Copilot access and a working Copilot Proxy installation.

**How to get it:**

1. Set up the proxy you want to use first.
2. Make sure it is reachable from this Mac.
3. Confirm the GitHub account already has Copilot access.
4. Return to onboarding and point Maumau at the proxy.

**Links:** [GitHub Copilot docs](/providers/github-copilot)

### SGLang

#### SGLang self-hosted server

**Best for:** a self-hosted SGLang server you already run yourself.

**What you need:** a running SGLang endpoint and the model id it serves.

**How to get it:**

1. Follow [SGLang docs](https://docs.sglang.ai/) to install and start the server.
2. Confirm the OpenAI-compatible endpoint works.
3. Note the served model id.
4. Return to onboarding and configure Maumau to use that endpoint.

**Links:** [SGLang provider docs](/providers/sglang)

### vLLM

#### vLLM self-hosted server

**Best for:** a self-hosted vLLM server you already manage.

**What you need:** a running vLLM OpenAI-compatible endpoint and the model id it exposes.

**How to get it:**

1. Follow [vLLM docs](https://docs.vllm.ai/) to install and start the server.
2. Confirm the server is reachable.
3. Note the model id it exposes.
4. Return to onboarding and configure Maumau to use that endpoint.

**Links:** [vLLM provider docs](/providers/vllm)

## Search providers

These are the optional `web_search` providers that embedded onboarding can add after the brain step.
The macOS flow should show them in this order: easiest and most broadly useful first.

### Brave Search

**Best for:** a strong default search API with good filters and broad coverage.

**What you need:** a Brave Search API subscription or trial key.

**How to get it:**

1. Go to [Brave Search API](https://brave.com/search/api/).
2. Sign in or create an account.
3. Create an API key or use a trial key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Brave Search docs](/tools/brave-search)

### DuckDuckGo Search (experimental)

**Best for:** the fastest zero-friction option when you want to skip account setup.

**What you need:** nothing extra. No signup, no key.

**How to get it:**

1. Choose `DuckDuckGo Search (experimental)` in onboarding.
2. Maumau enables it immediately.

**Quality / caveat:** experimental key-free fallback. Convenient, but usually less controllable than paid APIs.

**Links:** [DuckDuckGo Search docs](/tools/duckduckgo-search)

### Gemini Search

**Best for:** Google-grounded search when you already use Gemini.

**What you need:** a Gemini API key from Google AI Studio.

**How to get it:**

1. Go to [Google AI Studio API keys](https://aistudio.google.com/apikey).
2. Create a Gemini API key.
3. Return to onboarding and paste it into Maumau.

**Links:** [Gemini Search docs](/tools/gemini-search)

### Perplexity Search

**Best for:** search that already leans toward answer synthesis.

**What you need:** a Perplexity API key or compatible OpenRouter setup.

**How to get it:**

1. Go to [Perplexity API settings](https://www.perplexity.ai/settings/api).
2. Create an API key.
3. Return to onboarding and paste it into Maumau.

**Links:** [Perplexity Search docs](/tools/perplexity-search)

### Exa Search

**Best for:** semantic search, freshness filters, and content extraction.

**What you need:** an Exa account and API key.

**How to get it:**

1. Go to [Exa](https://exa.ai/).
2. Sign in or create an account.
3. Create an API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Exa Search docs](/tools/exa-search)

### Firecrawl Search

**Best for:** search flows that may later need scraping or extraction too.

**What you need:** a Firecrawl account and API key.

**How to get it:**

1. Go to [Firecrawl](https://www.firecrawl.dev/).
2. Sign in or create an account.
3. Create an API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Firecrawl docs](/tools/firecrawl)

### Tavily

**Best for:** RAG-style search with domain filters and concise summaries.

**What you need:** a Tavily account and API key.

**How to get it:**

1. Go to [Tavily](https://tavily.com/).
2. Sign in or create an account.
3. Create an API key.
4. Return to onboarding and paste it into Maumau.

**Links:** [Tavily docs](/tools/tavily)

### xAI Search

**Best for:** people already paying for xAI/Grok and wanting one account for models plus search.

**What you need:** an xAI API key.

**How to get it:**

1. Go to [xAI console](https://console.x.ai/).
2. Create an API key.
3. Return to onboarding and paste it into Maumau.

**Links:** [Grok Search docs](/tools/grok-search)

### Moonshot / Kimi Search

**Best for:** people already using Moonshot or Kimi accounts and wanting a matching search provider.

**What you need:** a Moonshot or Kimi API key.

**How to get it:**

1. Go to [Moonshot platform](https://platform.moonshot.cn/).
2. Create an API key.
3. Return to onboarding and paste it into Maumau.

**Links:** [Kimi Search docs](/tools/kimi-search)
