import type { PluginWebSearchProviderEntry } from "../plugins/types.js";
import type { AuthChoiceGroup, AuthChoiceOption } from "./auth-choice-options.static.js";
import type { AuthChoiceGroupId } from "./onboard-types.js";

type EmbeddedAuthGroupGuide = {
  rank: number;
  hint: string;
};

type EmbeddedAuthMethodGuide = {
  bestFor: string;
  whatYouNeed: string;
  howToGetIt: string;
  conciseHint?: string;
  officialUrl?: string;
  docsUrl?: string;
};

type EmbeddedSearchGuide = {
  rank: number;
  hint: string;
  bestFor: string;
  whatYouNeed: string;
  howToGetIt: string;
  quality: string;
  officialUrl?: string;
  docsUrl?: string;
};

type OnboardingGuideNote = {
  title: string;
  message: string;
};

const DEFAULT_PROVIDER_DOCS_URL = "https://docs.maumau.ai/start/choose-providers";
const DEFAULT_WEB_SEARCH_DOCS_URL =
  "https://docs.maumau.ai/start/choose-providers#search-providers";

const EMBEDDED_AUTH_GROUP_GUIDES: Readonly<Record<string, EmbeddedAuthGroupGuide>> = {
  openai: { rank: 0, hint: "ChatGPT sign-in or API key" },
  anthropic: { rank: 1, hint: "API key or Claude setup-token" },
  google: { rank: 2, hint: "Gemini API key or CLI sign-in" },
  ollama: { rank: 3, hint: "Run local models on this Mac" },
  openrouter: { rank: 4, hint: "One API for many model brands" },
  chutes: { rank: 5, hint: "Browser sign-in or API key" },
  qwen: { rank: 6, hint: "Browser sign-in" },
  modelstudio: { rank: 7, hint: "Alibaba-hosted Qwen + more" },
  minimax: { rank: 8, hint: "Global or China API / OAuth" },
  moonshot: { rank: 9, hint: "Kimi platform API key" },
  "kimi-code": { rank: 10, hint: "Dedicated Kimi coding endpoint" },
  deepseek: { rank: 11, hint: "Direct API key" },
  mistral: { rank: 12, hint: "Direct API key" },
  xai: { rank: 13, hint: "Grok API key" },
  huggingface: { rank: 14, hint: "HF token" },
  together: { rank: 15, hint: "Direct API key" },
  byteplus: { rank: 16, hint: "BytePlus ModelArk API key" },
  volcengine: { rank: 17, hint: "Volcano Engine / Doubao API key" },
  qianfan: { rank: 18, hint: "Baidu Qianfan API key" },
  zai: { rank: 19, hint: "Global, Coding Plan, or China key" },
  xiaomi: { rank: 20, hint: "MiMo API key" },
  synthetic: { rank: 21, hint: "Anthropic-compatible gateway" },
  opencode: { rank: 22, hint: "Zen or Go catalogs" },
  litellm: { rank: 23, hint: "Unified LLM gateway" },
  custom: { rank: 24, hint: "Bring your own endpoint" },
  "cloudflare-ai-gateway": { rank: 25, hint: "Account ID + Gateway ID + key" },
  "ai-gateway": { rank: 26, hint: "Vercel gateway API key" },
  kilocode: { rank: 27, hint: "OpenRouter-compatible key" },
  copilot: { rank: 28, hint: "Local proxy only in this app" },
  sglang: { rank: 29, hint: "Self-hosted server" },
  vllm: { rank: 30, hint: "Self-hosted OpenAI-compatible server" },
};

const EMBEDDED_AUTH_METHOD_ORDER_OVERRIDES: Readonly<Record<string, number>> = {
  "openai-codex": 0,
  "openai-api-key": 1,
  apiKey: 0,
  token: 1,
  "gemini-api-key": 0,
  "google-gemini-cli": 1,
  "minimax-global-api": 0,
  "minimax-global-oauth": 1,
  "minimax-cn-api": 2,
  "minimax-cn-oauth": 3,
  "zai-api-key": 0,
  "zai-global": 1,
  "zai-coding-global": 2,
  "zai-cn": 3,
  "zai-coding-cn": 4,
  "modelstudio-standard-api-key": 0,
  "modelstudio-api-key": 1,
  "modelstudio-standard-api-key-cn": 2,
  "modelstudio-api-key-cn": 3,
  "moonshot-api-key": 0,
  "moonshot-api-key-cn": 1,
  "opencode-zen": 0,
  "opencode-go": 1,
};

const EMBEDDED_AUTH_METHOD_GUIDES: Readonly<Record<string, EmbeddedAuthMethodGuide>> = {
  "openai-codex": {
    bestFor: "The easiest OpenAI setup if you already use ChatGPT.",
    whatYouNeed: "A ChatGPT account and a browser sign-in. No API key.",
    howToGetIt:
      "Create or sign in to ChatGPT, then come back here and approve the browser sign-in flow.",
    conciseHint: "No API key. Sign in with ChatGPT in your browser.",
    officialUrl: "https://chatgpt.com/",
    docsUrl: "https://docs.maumau.ai/providers/openai",
  },
  "openai-api-key": {
    bestFor: "API billing, automation, and project-scoped usage.",
    whatYouNeed: "An OpenAI Platform account with billing enabled.",
    howToGetIt:
      "Open the OpenAI Platform, add a payment method if needed, then create a secret key from the API keys page.",
    conciseHint: "Requires OpenAI Platform billing and an API key.",
    officialUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://docs.maumau.ai/providers/openai",
  },
  apiKey: {
    bestFor: "Standard Claude API usage and the smoothest Anthropic setup in Maumau.",
    whatYouNeed: "An Anthropic Console account and API billing access.",
    howToGetIt:
      "Sign in to the Anthropic Console, add billing if your workspace needs it, then create an API key.",
    conciseHint: "Requires an Anthropic Console API key.",
    officialUrl: "https://console.anthropic.com/settings/keys",
    docsUrl: "https://docs.maumau.ai/providers/anthropic",
  },
  token: {
    bestFor: "Using a Claude subscription instead of API billing.",
    whatYouNeed: "A Claude account and access to the Claude Code CLI on any machine.",
    howToGetIt:
      "Sign in to Claude, run `claude setup-token` on any machine where Claude Code is installed, then paste that token here.",
    conciseHint: "Use a Claude subscription setup-token from Claude Code.",
    officialUrl: "https://claude.ai/download",
    docsUrl: "https://docs.maumau.ai/providers/anthropic",
  },
  chutes: {
    bestFor: "The easiest Chutes setup because it starts in your browser.",
    whatYouNeed: "A Chutes account and browser access.",
    howToGetIt: "Create or sign in to Chutes, then finish the OAuth sign-in when Maumau opens it.",
    officialUrl: "https://chutes.ai/",
    docsUrl: DEFAULT_PROVIDER_DOCS_URL,
  },
  "chutes-api-key": {
    bestFor: "Direct API-key automation without the browser flow.",
    whatYouNeed: "A Chutes account and an API key from its dashboard.",
    howToGetIt:
      "Sign in to Chutes, open the API/dashboard area, and create a new API key for Maumau.",
    officialUrl: "https://chutes.ai/",
    docsUrl: DEFAULT_PROVIDER_DOCS_URL,
  },
  "gemini-api-key": {
    bestFor: "The recommended Google setup for most people.",
    whatYouNeed: "A Google account with Google AI Studio access.",
    howToGetIt: "Open Google AI Studio, create an API key, and paste that key into Maumau.",
    conciseHint: "Requires a Gemini API key from Google AI Studio.",
    officialUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://docs.maumau.ai/providers/google",
  },
  "google-gemini-cli": {
    bestFor: "Gemini CLI users who specifically want OAuth instead of an API key.",
    whatYouNeed: "A Google account plus Gemini CLI OAuth client setup.",
    howToGetIt:
      "Install or configure Gemini CLI first, make sure its OAuth client settings are ready, then sign in from the browser when prompted.",
    conciseHint: "Browser sign-in, but only after Gemini CLI OAuth is set up.",
    officialUrl: "https://github.com/google-gemini/gemini-cli",
    docsUrl: "https://docs.maumau.ai/providers/google",
  },
  ollama: {
    bestFor: "Running open models locally without a cloud API key.",
    whatYouNeed: "Ollama installed on this Mac and at least one model pulled locally.",
    howToGetIt:
      "Install Ollama, start the app or daemon, then run `ollama pull <model>` before returning to Maumau.",
    conciseHint: "Local setup. Install Ollama and pull a model first.",
    officialUrl: "https://ollama.com/download",
    docsUrl: "https://docs.maumau.ai/providers/ollama",
  },
  "openrouter-api-key": {
    bestFor: "Trying many model providers behind one API key.",
    whatYouNeed: "An OpenRouter account and API credits.",
    howToGetIt:
      "Sign in to OpenRouter, add credits if needed, then create an API key from the Keys page.",
    officialUrl: "https://openrouter.ai/keys",
    docsUrl: "https://docs.maumau.ai/providers/openrouter",
  },
  "qwen-portal": {
    bestFor: "A simple Qwen browser sign-in flow.",
    whatYouNeed: "A Qwen account and browser access.",
    howToGetIt: "Create or sign in to Qwen, then complete the OAuth flow when Maumau opens it.",
    officialUrl: "https://chat.qwen.ai/",
    docsUrl: "https://docs.maumau.ai/providers/qwen",
  },
  "modelstudio-standard-api-key": {
    bestFor: "Global pay-as-you-go access on Alibaba Cloud Model Studio.",
    whatYouNeed: "An Alibaba Cloud account with Model Studio enabled.",
    howToGetIt:
      "Open the global Model Studio console, activate the service if needed, then create a Standard API key for the global endpoint.",
    officialUrl: "https://www.alibabacloud.com/help/en/model-studio/",
    docsUrl: "https://docs.maumau.ai/providers/modelstudio",
  },
  "modelstudio-api-key": {
    bestFor: "Global subscription access through the Coding Plan endpoint.",
    whatYouNeed: "An Alibaba Cloud account with a Coding Plan subscription.",
    howToGetIt:
      "Open the global Model Studio console, subscribe to the Coding Plan if needed, then create a Coding Plan API key for the global endpoint.",
    officialUrl: "https://www.alibabacloud.com/help/en/model-studio/",
    docsUrl: "https://docs.maumau.ai/providers/modelstudio",
  },
  "modelstudio-standard-api-key-cn": {
    bestFor: "China-region pay-as-you-go access on Alibaba Cloud Model Studio.",
    whatYouNeed: "An Alibaba Cloud China account with Model Studio enabled.",
    howToGetIt:
      "Open the China-region Model Studio console, activate the service, then create a Standard API key for the China endpoint.",
    officialUrl: "https://help.aliyun.com/zh/model-studio/",
    docsUrl: "https://docs.maumau.ai/providers/modelstudio",
  },
  "modelstudio-api-key-cn": {
    bestFor: "China-region subscription access through the Coding Plan endpoint.",
    whatYouNeed: "An Alibaba Cloud China account with a Coding Plan subscription.",
    howToGetIt:
      "Open the China-region Model Studio console, subscribe to the Coding Plan if needed, then create a Coding Plan API key for the China endpoint.",
    officialUrl: "https://help.aliyun.com/zh/model-studio/",
    docsUrl: "https://docs.maumau.ai/providers/modelstudio",
  },
  "minimax-global-api": {
    bestFor: "The cleanest MiniMax setup for international users who want API billing.",
    whatYouNeed: "A MiniMax account on the global platform and an API key.",
    howToGetIt:
      "Open the global MiniMax platform, enable the API or add billing if needed, then create a global API key.",
    officialUrl: "https://platform.minimax.io/",
    docsUrl: "https://docs.maumau.ai/providers/minimax",
  },
  "minimax-global-oauth": {
    bestFor: "Global MiniMax Coding Plan users who prefer sign-in over pasted keys.",
    whatYouNeed: "A MiniMax global account with the Coding Plan flow available.",
    howToGetIt:
      "Sign in to the global MiniMax platform first, then finish the OAuth browser flow from Maumau.",
    officialUrl: "https://platform.minimax.io/",
    docsUrl: "https://docs.maumau.ai/providers/minimax",
  },
  "minimax-cn-api": {
    bestFor: "MiniMax API billing for China-region accounts.",
    whatYouNeed: "A China-region MiniMax account and API key.",
    howToGetIt:
      "Open the China-region MiniMax platform, enable the API or add billing if needed, then create a China-region API key.",
    officialUrl: "https://platform.minimaxi.com/",
    docsUrl: "https://docs.maumau.ai/providers/minimax",
  },
  "minimax-cn-oauth": {
    bestFor: "China-region MiniMax Coding Plan users who want OAuth.",
    whatYouNeed: "A China-region MiniMax account with Coding Plan access.",
    howToGetIt:
      "Sign in to the China-region MiniMax platform first, then finish the OAuth browser flow from Maumau.",
    officialUrl: "https://platform.minimaxi.com/",
    docsUrl: "https://docs.maumau.ai/providers/minimax",
  },
  "moonshot-api-key": {
    bestFor: "International Moonshot / Kimi API access.",
    whatYouNeed: "A Moonshot account on the `.ai` platform and an API key.",
    howToGetIt:
      "Sign in to the Moonshot `.ai` platform, enable billing if needed, and create an API key.",
    officialUrl: "https://platform.moonshot.ai/",
    docsUrl: "https://docs.maumau.ai/providers/moonshot",
  },
  "moonshot-api-key-cn": {
    bestFor: "China-region Moonshot / Kimi API access.",
    whatYouNeed: "A Moonshot account on the `.cn` platform and an API key.",
    howToGetIt:
      "Sign in to the Moonshot `.cn` platform, enable billing if needed, and create an API key.",
    officialUrl: "https://platform.moonshot.cn/",
    docsUrl: "https://docs.maumau.ai/providers/moonshot",
  },
  "kimi-code-api-key": {
    bestFor: "People who specifically want Kimi's dedicated coding endpoint.",
    whatYouNeed: "A Kimi Code subscription or API access plan.",
    howToGetIt:
      "Sign in to Kimi Code, make sure your subscription/API access is active, then create the coding API key.",
    officialUrl: "https://kimi.com/",
    docsUrl: "https://docs.maumau.ai/providers/moonshot",
  },
  "deepseek-api-key": {
    bestFor: "Direct DeepSeek API usage.",
    whatYouNeed: "A DeepSeek account and API credits.",
    howToGetIt:
      "Sign in to DeepSeek, add credits if needed, then create an API key from the platform console.",
    officialUrl: "https://platform.deepseek.com/api_keys",
    docsUrl: "https://docs.maumau.ai/start/choose-providers",
  },
  "mistral-api-key": {
    bestFor: "Direct Mistral API usage.",
    whatYouNeed: "A Mistral Console account and API key.",
    howToGetIt: "Open La Plateforme, enable billing if needed, then create an API key for Maumau.",
    officialUrl: "https://console.mistral.ai/api-keys/",
    docsUrl: "https://docs.maumau.ai/providers/mistral",
  },
  "xai-api-key": {
    bestFor: "Direct Grok API usage from xAI.",
    whatYouNeed: "An xAI developer account and API key.",
    howToGetIt: "Sign in to the xAI console, make sure billing is ready, then create an API key.",
    officialUrl: "https://console.x.ai/",
    docsUrl: "https://docs.maumau.ai/providers/xai",
  },
  "huggingface-api-key": {
    bestFor: "Using Hugging Face Inference with a single HF token.",
    whatYouNeed: "A Hugging Face account and a token with inference access.",
    howToGetIt:
      "Sign in to Hugging Face, create an access token, and make sure your plan allows the inference endpoint you want.",
    officialUrl: "https://huggingface.co/settings/tokens",
    docsUrl: "https://docs.maumau.ai/providers/huggingface",
  },
  "together-api-key": {
    bestFor: "Together AI hosted open-model access.",
    whatYouNeed: "A Together account and API credits.",
    howToGetIt:
      "Sign in to Together, add credits if needed, then create an API key from the account console.",
    officialUrl: "https://api.together.ai/settings/api-keys",
    docsUrl: "https://docs.maumau.ai/providers/together",
  },
  "byteplus-api-key": {
    bestFor: "BytePlus ModelArk access for supported hosted models.",
    whatYouNeed: "A BytePlus account with ModelArk/API access.",
    howToGetIt:
      "Sign in to BytePlus, activate the model service you need, then create an API key from the console.",
    officialUrl: "https://console.byteplus.com/",
    docsUrl: DEFAULT_PROVIDER_DOCS_URL,
  },
  "volcengine-api-key": {
    bestFor: "Volcano Engine / Doubao API usage.",
    whatYouNeed: "A Volcengine account with Ark access.",
    howToGetIt:
      "Sign in to Volcengine, open Ark or the API console, and create an API key for Maumau.",
    officialUrl: "https://console.volcengine.com/",
    docsUrl: "https://docs.maumau.ai/providers/volcengine",
  },
  "qianfan-api-key": {
    bestFor: "Baidu Qianfan hosted-model access.",
    whatYouNeed: "A Baidu Intelligent Cloud account with Qianfan enabled.",
    howToGetIt:
      "Sign in to Qianfan, activate the service if needed, then generate the API credential Maumau expects for the Qianfan provider.",
    officialUrl: "https://qianfan.cloud.baidu.com/",
    docsUrl: "https://docs.maumau.ai/providers/qianfan",
  },
  "zai-api-key": {
    bestFor: "The plain Z.AI API key path when you do not need a region-specific variant.",
    whatYouNeed: "A Z.AI account and API key.",
    howToGetIt: "Sign in to Z.AI and create an API key from the developer console.",
    officialUrl: "https://open.bigmodel.cn/",
    docsUrl: "https://docs.maumau.ai/providers/zai",
  },
  "zai-global": {
    bestFor: "Z.AI Global API usage outside China.",
    whatYouNeed: "A Z.AI account with the global API endpoint enabled.",
    howToGetIt:
      "Sign in to the global Z.AI console, create the API key, and choose the Global option here.",
    officialUrl: "https://open.bigmodel.cn/",
    docsUrl: "https://docs.maumau.ai/providers/zai",
  },
  "zai-coding-global": {
    bestFor: "Z.AI Coding Plan users on the global endpoint.",
    whatYouNeed: "A Z.AI Coding Plan account for the global region.",
    howToGetIt:
      "Subscribe to the Coding Plan if needed, then create the global Coding Plan key in the Z.AI console.",
    officialUrl: "https://open.bigmodel.cn/",
    docsUrl: "https://docs.maumau.ai/providers/zai",
  },
  "zai-cn": {
    bestFor: "Z.AI API usage on the China endpoint.",
    whatYouNeed: "A China-region Z.AI account and API key.",
    howToGetIt:
      "Sign in to the China-region Z.AI console, create the API key, and choose the CN option here.",
    officialUrl: "https://open.bigmodel.cn/",
    docsUrl: "https://docs.maumau.ai/providers/zai",
  },
  "zai-coding-cn": {
    bestFor: "Z.AI Coding Plan users on the China endpoint.",
    whatYouNeed: "A China-region Z.AI Coding Plan account and key.",
    howToGetIt:
      "Subscribe to the Coding Plan if needed, then create the Coding Plan CN key in the Z.AI console.",
    officialUrl: "https://open.bigmodel.cn/",
    docsUrl: "https://docs.maumau.ai/providers/zai",
  },
  "xiaomi-api-key": {
    bestFor: "Direct Xiaomi MiMo API access.",
    whatYouNeed: "A Xiaomi AI platform account and API key.",
    howToGetIt:
      "Sign in to Xiaomi's AI platform, enable API access, then create an API key for Maumau.",
    officialUrl: "https://platform.xiaomi.com/",
    docsUrl: "https://docs.maumau.ai/providers/xiaomi",
  },
  "synthetic-api-key": {
    bestFor: "A multi-model Anthropic-compatible hosted gateway.",
    whatYouNeed: "A Synthetic account and API key.",
    howToGetIt:
      "Sign in to Synthetic, make sure your project is active, then create an API key from the dashboard.",
    officialUrl: "https://synthetic.new/",
    docsUrl: "https://docs.maumau.ai/providers/synthetic",
  },
  "opencode-zen": {
    bestFor: "OpenCode's Zen catalog with its shared API key.",
    whatYouNeed: "An OpenCode account and the shared API key for Zen/Go.",
    howToGetIt: "Sign in to OpenCode, copy the shared API key, and then pick the Zen catalog here.",
    officialUrl: "https://opencode.ai/",
    docsUrl: "https://docs.maumau.ai/providers/opencode",
  },
  "opencode-go": {
    bestFor: "OpenCode's Go catalog with the same shared API key.",
    whatYouNeed: "An OpenCode account and the shared API key for Zen/Go.",
    howToGetIt: "Sign in to OpenCode, copy the shared API key, and then pick the Go catalog here.",
    officialUrl: "https://opencode.ai/",
    docsUrl: "https://docs.maumau.ai/providers/opencode-go",
  },
  "litellm-api-key": {
    bestFor: "People already using a LiteLLM gateway in front of many providers.",
    whatYouNeed: "A reachable LiteLLM endpoint, API key, and the model names your gateway exposes.",
    howToGetIt:
      "Start or locate your LiteLLM gateway first, note the base URL and key, then enter them in Maumau.",
    officialUrl: "https://docs.litellm.ai/",
    docsUrl: "https://docs.maumau.ai/providers/litellm",
  },
  "custom-api-key": {
    bestFor: "Any OpenAI-compatible or Anthropic-compatible endpoint Maumau does not preconfigure.",
    whatYouNeed:
      "A base URL, API key, model id, and knowledge of whether the endpoint speaks OpenAI or Anthropic format.",
    howToGetIt:
      "Collect those values from your provider or self-hosted gateway first, then enter them into Maumau exactly as given.",
    docsUrl: DEFAULT_PROVIDER_DOCS_URL,
  },
  "cloudflare-ai-gateway-api-key": {
    bestFor: "Routing model traffic through Cloudflare AI Gateway.",
    whatYouNeed: "A Cloudflare account plus Account ID, Gateway ID, and API token/key.",
    howToGetIt:
      "Create the AI Gateway in Cloudflare first, copy the Account ID and Gateway ID, then create an API token or key that can use it.",
    officialUrl: "https://dash.cloudflare.com/",
    docsUrl: "https://docs.maumau.ai/providers/cloudflare-ai-gateway",
  },
  "ai-gateway-api-key": {
    bestFor: "Routing supported providers through Vercel AI Gateway.",
    whatYouNeed: "A Vercel account and AI Gateway API key.",
    howToGetIt:
      "Create or open your Vercel AI Gateway, then generate the gateway API key you want Maumau to use.",
    officialUrl: "https://vercel.com/docs/ai-gateway",
    docsUrl: "https://docs.maumau.ai/providers/vercel-ai-gateway",
  },
  "kilocode-api-key": {
    bestFor: "People already using Kilo Gateway or OpenRouter-compatible Kilo routing.",
    whatYouNeed: "A Kilo account and gateway API key.",
    howToGetIt: "Sign in to Kilo Gateway, create an API key, and then paste it here.",
    officialUrl: "https://kilocode.ai/",
    docsUrl: "https://docs.maumau.ai/providers/kilocode",
  },
  "copilot-proxy": {
    bestFor: "Using GitHub Copilot through a separate local proxy setup.",
    whatYouNeed: "A GitHub account with Copilot access and a working Copilot Proxy installation.",
    howToGetIt:
      "Set up the Copilot proxy first on your machine or network, make sure it is reachable, then come back and point Maumau at it.",
    officialUrl: "https://github.com/features/copilot",
    docsUrl: "https://docs.maumau.ai/providers/github-copilot",
  },
  sglang: {
    bestFor: "A self-hosted SGLang server you already run yourself.",
    whatYouNeed: "A running SGLang endpoint and the model id it serves.",
    howToGetIt:
      "Install and start SGLang first, confirm the OpenAI-compatible endpoint works, then configure Maumau to use it.",
    officialUrl: "https://docs.sglang.ai/",
    docsUrl: "https://docs.maumau.ai/providers/sglang",
  },
  vllm: {
    bestFor: "A self-hosted vLLM server you already manage.",
    whatYouNeed: "A running vLLM OpenAI-compatible endpoint and the model id it exposes.",
    howToGetIt:
      "Install and start vLLM first, confirm the server is reachable, then configure Maumau to use that endpoint.",
    officialUrl: "https://docs.vllm.ai/",
    docsUrl: "https://docs.maumau.ai/providers/vllm",
  },
  "venice-api-key": {
    bestFor: "Direct Venice AI API access.",
    whatYouNeed: "A Venice account and API key.",
    howToGetIt:
      "Sign in to Venice AI, enable API access if needed, and create an API key for Maumau.",
    officialUrl: "https://venice.ai/",
    docsUrl: "https://docs.maumau.ai/providers/venice",
  },
};

const EMBEDDED_SEARCH_GUIDES: Readonly<Record<string, EmbeddedSearchGuide>> = {
  brave: {
    rank: 0,
    hint: "Popular search API with strong filters",
    bestFor: "A strong default search API with good filters and broad coverage.",
    whatYouNeed: "A Brave Search API subscription or trial key.",
    howToGetIt: "Open Brave Search API, create a key, and paste it into Maumau.",
    quality: "Good general web search with structured metadata and region/language controls.",
    officialUrl: "https://brave.com/search/api/",
    docsUrl: "https://docs.maumau.ai/tools/brave-search",
  },
  duckduckgo: {
    rank: 1,
    hint: "No signup, no key, experimental",
    bestFor: "The fastest zero-friction option when you want to skip account setup.",
    whatYouNeed: "Nothing extra. No signup, no key.",
    howToGetIt: "Just choose it here. Maumau enables it immediately.",
    quality:
      "Experimental key-free fallback. Convenient, but usually less controllable than paid APIs.",
    officialUrl: "https://duckduckgo.com/",
    docsUrl: "https://docs.maumau.ai/tools/duckduckgo-search",
  },
  gemini: {
    rank: 2,
    hint: "Gemini grounding with Google Search",
    bestFor: "Google-grounded search when you already use Gemini.",
    whatYouNeed: "A Gemini API key from Google AI Studio.",
    howToGetIt: "Open Google AI Studio, create an API key, and paste it into Maumau.",
    quality:
      "Strong grounding for Google ecosystem users and pairs well with the Google model provider.",
    officialUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://docs.maumau.ai/tools/gemini-search",
  },
  google: {
    rank: 2,
    hint: "Gemini grounding with Google Search",
    bestFor: "Google-grounded search when you already use Gemini.",
    whatYouNeed: "A Gemini API key from Google AI Studio.",
    howToGetIt: "Open Google AI Studio, create an API key, and paste it into Maumau.",
    quality:
      "Strong grounding for Google ecosystem users and pairs well with the Google model provider.",
    officialUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://docs.maumau.ai/tools/gemini-search",
  },
  perplexity: {
    rank: 3,
    hint: "Structured search with answer-style responses",
    bestFor: "Search that already leans toward answer synthesis.",
    whatYouNeed: "A Perplexity API key or compatible OpenRouter setup.",
    howToGetIt: "Open Perplexity API settings, create a key, and paste it into Maumau.",
    quality: "Great for quick answer-style search results with citations.",
    officialUrl: "https://www.perplexity.ai/settings/api",
    docsUrl: "https://docs.maumau.ai/tools/perplexity-search",
  },
  exa: {
    rank: 4,
    hint: "Neural search with content extraction",
    bestFor: "Search flows that care about freshness, extraction, and developer-friendly filters.",
    whatYouNeed: "An Exa account and API key.",
    howToGetIt: "Sign in to Exa, create an API key, and paste it into Maumau.",
    quality: "Very good for semantic search, date filters, and extracting article content.",
    officialUrl: "https://exa.ai/",
    docsUrl: "https://docs.maumau.ai/tools/exa-search",
  },
  firecrawl: {
    rank: 5,
    hint: "Search plus scraping-friendly structured results",
    bestFor: "When you also expect scraping/extraction workflows later.",
    whatYouNeed: "A Firecrawl account and API key.",
    howToGetIt: "Open Firecrawl, create an API key, and paste it into Maumau.",
    quality:
      "Good structured search results and a natural fit if you also use Firecrawl scraping tools.",
    officialUrl: "https://www.firecrawl.dev/",
    docsUrl: "https://docs.maumau.ai/tools/firecrawl",
  },
  tavily: {
    rank: 6,
    hint: "Search tuned for LLM/RAG workflows",
    bestFor: "RAG-style search with domain filters and concise summaries.",
    whatYouNeed: "A Tavily account and API key.",
    howToGetIt: "Open Tavily, create an API key, and paste it into Maumau.",
    quality: "Popular in agent workflows and useful when you want structured summaries quickly.",
    officialUrl: "https://tavily.com/",
    docsUrl: "https://docs.maumau.ai/tools/tavily",
  },
  grok: {
    rank: 7,
    hint: "xAI web-grounded responses",
    bestFor: "People already paying for xAI/Grok and wanting one account for models plus search.",
    whatYouNeed: "An xAI API key.",
    howToGetIt: "Open the xAI console, create an API key, and paste it into Maumau.",
    quality:
      "Convenient if you already use xAI, though the search API is less common than Brave/Perplexity/Exa.",
    officialUrl: "https://console.x.ai/",
    docsUrl: "https://docs.maumau.ai/tools/grok-search",
  },
  xai: {
    rank: 7,
    hint: "xAI web-grounded responses",
    bestFor: "People already paying for xAI/Grok and wanting one account for models plus search.",
    whatYouNeed: "An xAI API key.",
    howToGetIt: "Open the xAI console, create an API key, and paste it into Maumau.",
    quality:
      "Convenient if you already use xAI, though the search API is less common than Brave/Perplexity/Exa.",
    officialUrl: "https://console.x.ai/",
    docsUrl: "https://docs.maumau.ai/tools/grok-search",
  },
  kimi: {
    rank: 8,
    hint: "Kimi web search",
    bestFor: "People already using Moonshot/Kimi accounts and wanting a matching search provider.",
    whatYouNeed: "A Moonshot / Kimi API key.",
    howToGetIt: "Open the Moonshot platform, create an API key, and paste it into Maumau.",
    quality: "Useful for Kimi-centric setups, but less common than the top search APIs above.",
    officialUrl: "https://platform.moonshot.cn/",
    docsUrl: "https://docs.maumau.ai/tools/kimi-search",
  },
  moonshot: {
    rank: 8,
    hint: "Kimi web search",
    bestFor: "People already using Moonshot/Kimi accounts and wanting a matching search provider.",
    whatYouNeed: "A Moonshot / Kimi API key.",
    howToGetIt: "Open the Moonshot platform, create an API key, and paste it into Maumau.",
    quality: "Useful for Kimi-centric setups, but less common than the top search APIs above.",
    officialUrl: "https://platform.moonshot.cn/",
    docsUrl: "https://docs.maumau.ai/tools/kimi-search",
  },
};

function compareAlphabetically(left: string, right: string): number {
  return left.localeCompare(right);
}

function resolveEmbeddedAuthGroupRank(groupId: AuthChoiceGroupId | undefined): number {
  if (!groupId) {
    return Number.MAX_SAFE_INTEGER;
  }
  return EMBEDDED_AUTH_GROUP_GUIDES[groupId]?.rank ?? Number.MAX_SAFE_INTEGER;
}

function resolveEmbeddedAuthMethodRank(option: Pick<AuthChoiceOption, "value" | "label">): number {
  const override = EMBEDDED_AUTH_METHOD_ORDER_OVERRIDES[option.value];
  if (override !== undefined) {
    return override;
  }

  const value = option.value.trim().toLowerCase();
  const label = option.label.trim().toLowerCase();

  if (value === "openai-codex" || value === "chutes" || value === "qwen-portal") {
    return 100;
  }
  if (value === "apikey" || value.includes("api-key") || label.includes("api key")) {
    return 200;
  }
  if (value.includes("oauth") || label.includes("oauth") || label.includes("sign-in")) {
    return 300;
  }
  if (value === "token" || value === "setup-token" || label.includes("setup-token")) {
    return 400;
  }
  if (
    value === "ollama" ||
    value === "sglang" ||
    value === "vllm" ||
    value.includes("custom") ||
    value.includes("litellm")
  ) {
    return 500;
  }
  return 600;
}

function buildAuthChoiceGuideMessage(
  option: Pick<AuthChoiceOption, "value" | "label">,
): EmbeddedAuthMethodGuide {
  return (
    EMBEDDED_AUTH_METHOD_GUIDES[option.value] ?? {
      bestFor: `Using ${option.label} in Maumau.`,
      whatYouNeed: "The account, key, or endpoint required by that provider.",
      howToGetIt:
        "Open the provider's dashboard or install the local runtime first, then come back and continue here.",
      docsUrl: DEFAULT_PROVIDER_DOCS_URL,
    }
  );
}

export function resolveEmbeddedAuthChoiceOptionHint(
  option: Pick<AuthChoiceOption, "value" | "hint" | "label">,
): string | undefined {
  const guide = EMBEDDED_AUTH_METHOD_GUIDES[option.value];
  if (guide) {
    return [
      `Best for: ${guide.bestFor}`,
      `What you need: ${guide.whatYouNeed}`,
      `How to get it: ${guide.howToGetIt}`,
    ].join("\n");
  }
  return option.hint;
}

function formatAuthChoiceGuideBlock(option: Pick<AuthChoiceOption, "value" | "label">): string[] {
  const guide = buildAuthChoiceGuideMessage(option);
  return [
    option.label,
    `Best for: ${guide.bestFor}`,
    `What you need: ${guide.whatYouNeed}`,
    `How to get it: ${guide.howToGetIt}`,
    ...(guide.officialUrl ? [`Official: ${guide.officialUrl}`] : []),
    `Docs: ${guide.docsUrl ?? DEFAULT_PROVIDER_DOCS_URL}`,
  ];
}

function buildSearchGuideMessage(
  entry: Pick<
    PluginWebSearchProviderEntry,
    "id" | "label" | "signupUrl" | "docsUrl" | "hint" | "requiresCredential"
  >,
): EmbeddedSearchGuide {
  return (
    EMBEDDED_SEARCH_GUIDES[entry.id] ?? {
      rank: Number.MAX_SAFE_INTEGER,
      hint: entry.hint,
      bestFor: `Using ${entry.label} for web search in Maumau.`,
      whatYouNeed:
        entry.requiresCredential === false
          ? "Nothing extra. No signup, no key."
          : `${entry.label} credentials or API access.`,
      howToGetIt:
        entry.requiresCredential === false
          ? "Just choose it here and Maumau will enable it."
          : "Open the provider site, create the required key, and paste it into Maumau.",
      quality:
        entry.requiresCredential === false
          ? "Key-free fallback."
          : "See the provider docs for details.",
      officialUrl: entry.signupUrl,
      docsUrl: entry.docsUrl ?? DEFAULT_WEB_SEARCH_DOCS_URL,
    }
  );
}

export function compareEmbeddedAuthChoiceOptions(
  left: Pick<AuthChoiceOption, "groupId" | "label" | "value">,
  right: Pick<AuthChoiceOption, "groupId" | "label" | "value">,
): number {
  const groupRankDiff =
    resolveEmbeddedAuthGroupRank(left.groupId) - resolveEmbeddedAuthGroupRank(right.groupId);
  if (groupRankDiff !== 0) {
    return groupRankDiff;
  }

  const methodRankDiff = resolveEmbeddedAuthMethodRank(left) - resolveEmbeddedAuthMethodRank(right);
  if (methodRankDiff !== 0) {
    return methodRankDiff;
  }

  return compareAlphabetically(left.label, right.label);
}

export function compareEmbeddedAuthChoiceGroups(
  left: Pick<AuthChoiceGroup, "label" | "value">,
  right: Pick<AuthChoiceGroup, "label" | "value">,
): number {
  const rankDiff =
    resolveEmbeddedAuthGroupRank(left.value) - resolveEmbeddedAuthGroupRank(right.value);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  return compareAlphabetically(left.label, right.label);
}

export function resolveEmbeddedAuthChoiceGroupHint(
  groupId: AuthChoiceGroupId | undefined,
  fallbackHint?: string,
): string | undefined {
  return EMBEDDED_AUTH_GROUP_GUIDES[groupId ?? ""]?.hint ?? fallbackHint;
}

export function buildEmbeddedAuthChoiceNote(
  group: Pick<AuthChoiceGroup, "label" | "options">,
): OnboardingGuideNote {
  const sections = group.options
    .toSorted(compareEmbeddedAuthChoiceOptions)
    .flatMap((option, index) => [
      ...(index === 0 ? [] : [""]),
      ...formatAuthChoiceGuideBlock(option),
    ]);

  return {
    title: `Before you choose ${group.label}`,
    message: ["Review what you need before continuing.", "", ...sections].join("\n"),
  };
}

export function sortEmbeddedSearchProviders(
  providers: PluginWebSearchProviderEntry[],
): PluginWebSearchProviderEntry[] {
  return providers.toSorted((left, right) => {
    const leftGuide = buildSearchGuideMessage(left);
    const rightGuide = buildSearchGuideMessage(right);
    if (leftGuide.rank !== rightGuide.rank) {
      return leftGuide.rank - rightGuide.rank;
    }
    return compareAlphabetically(left.label, right.label);
  });
}

export function resolveEmbeddedSearchProviderHint(
  entry: Pick<PluginWebSearchProviderEntry, "id" | "hint" | "signupUrl" | "docsUrl" | "label">,
): string {
  return buildSearchGuideMessage({ ...entry, requiresCredential: true }).hint;
}

export function buildEmbeddedSearchProviderNote(
  entry: Pick<
    PluginWebSearchProviderEntry,
    "id" | "label" | "signupUrl" | "docsUrl" | "hint" | "requiresCredential"
  >,
): OnboardingGuideNote {
  const guide = buildSearchGuideMessage(entry);
  return {
    title: `Before you choose ${entry.label}`,
    message: [
      "Review what you need before continuing.",
      "",
      `Best for: ${guide.bestFor}`,
      `What you need: ${guide.whatYouNeed}`,
      `How to get it: ${guide.howToGetIt}`,
      `Quality / caveat: ${guide.quality}`,
      ...(guide.officialUrl ? [`Official: ${guide.officialUrl}`] : []),
      `Docs: ${guide.docsUrl ?? DEFAULT_WEB_SEARCH_DOCS_URL}`,
    ].join("\n"),
  };
}
