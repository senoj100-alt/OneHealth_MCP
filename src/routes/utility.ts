import { Hono } from "hono";
import type { Env, Variables } from "../app.js";
import {
	type AiProviderId,
	deleteAiConnection,
	getAiConnection,
	listAiConnectionSummaries,
	upsertAiConnection,
} from "../lib/ai-connections.js";
import {
	consumeTelegramLinkCode,
	createTelegramLinkCode,
	getNotificationSchedule,
	getTelegramConnection,
	normalizeInsightMode,
	normalizeNotificationTimes,
	normalizeTimezone,
	upsertNotificationSchedule,
	upsertTelegramConnection,
} from "../lib/notifications.js";
import { getOneHealthServiceStatuses } from "../lib/service-registry.js";
import type { Props } from "../utils.js";

const utilityRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

utilityRoutes.get("/health", (c) => {
	return c.json({
		status: "healthy",
		name: "OneHealth_MCP",
		transport: "streamable-http",
		version: "1.0.0",
		oauth: "enabled",
	});
});

utilityRoutes.get("/stats", async (c) => {
	try {
		const kv = c.env.OAUTH_KV;
		const [userKeys, sessionKeys, approvalKeys] = await Promise.all([
			kv.list({ prefix: "hevy_key:" }),
			kv.list({ prefix: "session:" }),
			kv.list({ prefix: "approval:" }),
		]);

		return c.json({
			total_users: userKeys.keys.length,
			active_sessions: sessionKeys.keys.length,
			pending_approvals: approvalKeys.keys.length,
		});
	} catch (error) {
		console.error("Error fetching stats:", error);
		return c.json(
			{
				error: "Failed to fetch stats",
				total_users: 0,
				active_sessions: 0,
				pending_approvals: 0,
			},
			500,
		);
	}
});

utilityRoutes.get("/signup", (c) => {
	const googleReady = Boolean(c.env.GOOGLE_LOGIN_CLIENT_ID && c.env.GOOGLE_LOGIN_CLIENT_SECRET);
	const googleAction = googleReady
		? `<a class="button google" href="/auth/google?return_to=/connections">Continue with Google</a>`
		: `<span class="button disabled">Google setup pending</span>`;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Sign up - OneHealth_MCP</title>
	<style>
		:root {
			color-scheme: dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			--bg: #080b10;
			--panel: #10151f;
			--line: #273142;
			--text: #f5f7fb;
			--muted: #aab4c5;
			--green: #8ee6b1;
			--ink: #091019;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			display: grid;
			place-items: center;
			padding: 24px;
			color: var(--text);
			background:
				radial-gradient(circle at 80% 4%, rgba(157, 185, 255, 0.18), transparent 30rem),
				linear-gradient(180deg, #0c1119 0%, var(--bg) 100%);
		}
		main {
			width: min(620px, 100%);
			padding: 30px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: var(--panel);
			box-shadow: 0 34px 90px rgba(0, 0, 0, 0.32);
		}
		.brand {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 28px;
			font-weight: 850;
		}
		.mark {
			display: grid;
			place-items: center;
			width: 34px;
			height: 34px;
			border-radius: 8px;
			background: linear-gradient(135deg, var(--green), #9db9ff);
			color: var(--ink);
			font-weight: 900;
		}
		h1 {
			margin: 0 0 12px;
			font-size: clamp(2.5rem, 9vw, 4.8rem);
			line-height: 0.95;
			letter-spacing: 0;
		}
		p {
			margin: 0;
			color: var(--muted);
			line-height: 1.65;
		}
		.actions {
			display: grid;
			gap: 12px;
			margin-top: 28px;
		}
		.button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 50px;
			padding: 0 18px;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			font-weight: 800;
			text-decoration: none;
		}
		.button.primary {
			border-color: transparent;
			background: var(--text);
			color: var(--ink);
		}
		.button.google {
			border-color: rgba(142, 230, 177, 0.32);
			background: rgba(142, 230, 177, 0.09);
		}
		.button.disabled {
			justify-content: center;
			color: var(--muted);
			cursor: not-allowed;
			opacity: 0.72;
		}
		.note {
			margin-top: 18px;
			font-size: 0.92rem;
		}
		.back {
			display: inline-block;
			margin-top: 24px;
			color: var(--green);
			font-weight: 750;
			text-decoration: none;
		}
	</style>
</head>
<body>
	<main>
		<a class="brand" href="/">
			<span class="mark">1H</span>
			<span>OneHealth_MCP</span>
		</a>
		<h1>Create your OneHealth account.</h1>
		<p>Choose a sign-in method, then connect your fitness sources from the dashboard.</p>
		<div class="actions">
			<a class="button primary" href="/connections">Continue with GitHub</a>
			${googleAction}
		</div>
		<p class="note">GitHub is available now. Google sign-in will work after the Google OAuth client ID and secret are configured in Cloudflare.</p>
		<a class="back" href="/">Back to homepage</a>
	</main>
</body>
</html>`;

	return c.html(html);
});

type SettingsCard = {
	id: string;
	label: string;
	status: string;
	description: string;
	href: string;
	guidance?: string[];
};

type SourceSettingsCard = SettingsCard & {
	authType: "api_key" | "oauth" | "username_password" | "coming_soon";
	fields: string[];
	helpText: string;
	helpUrl?: string;
	helpLabel?: string;
};

const SOURCE_SETTINGS: SourceSettingsCard[] = [
	{
		id: "hevy",
		label: "Hevy",
		status: "Live",
		description: "Strength training, workouts, routines, and exercise history.",
		href: "/settings/source/hevy",
		authType: "api_key",
		fields: ["apiKey"],
		helpText: "Add your Hevy API key from Hevy developer settings.",
		helpUrl: "https://hevy.com/settings?developer",
		helpLabel: "Open Hevy settings",
	},
	{
		id: "strava",
		label: "Strava",
		status: "Ready",
		description: "Endurance activities, activity detail, HR, pace, and power when available.",
		href: "/settings/source/strava",
		authType: "oauth",
		fields: ["accessToken", "refreshToken"],
		helpText: "Paste Strava OAuth tokens for now. Full OAuth connect can be added later.",
		helpUrl: "https://www.strava.com/settings/api",
		helpLabel: "Open Strava API settings",
	},
	{
		id: "cronometer",
		label: "Cronometer",
		status: "Live",
		description: "Nutrition diary, macros, foods, and daily nutrition targets.",
		href: "/settings/source/cronometer",
		authType: "username_password",
		fields: ["username", "password"],
		helpText: "Add your Cronometer username/email and password for nutrition sync.",
		helpUrl: "https://cronometer.com/login/",
		helpLabel: "Open Cronometer",
	},
	{
		id: "intervals_icu",
		label: "Intervals.icu",
		status: "Live",
		description: "Training load, wellness, activities, events, and gear.",
		href: "/settings/source/intervals_icu",
		authType: "api_key",
		fields: ["apiKey", "athleteId"],
		helpText: "Use your Intervals.icu API key and athlete ID.",
		helpUrl: "https://intervals.icu/settings",
		helpLabel: "Open Intervals.icu settings",
	},
	{
		id: "fitbit",
		label: "Fitbit",
		status: "OAuth",
		description: "Activity, sleep, weight, heart data, and recovery signals.",
		href: "/settings/source/fitbit",
		authType: "oauth",
		fields: ["accessToken", "refreshToken"],
		helpText: "Use OAuth connect when app credentials are configured, or paste Fitbit tokens.",
		helpUrl: "https://dev.fitbit.com/apps",
		helpLabel: "Open Fitbit apps",
	},
	{
		id: "google_fit",
		label: "Google Fit",
		status: "OAuth",
		description: "Activity, body, heart-rate, and sleep aggregates from Google Fit.",
		href: "/settings/source/google_fit",
		authType: "oauth",
		fields: ["accessToken", "refreshToken"],
		helpText: "Use OAuth connect when app credentials are configured, or paste Google Fit tokens.",
		helpUrl: "https://console.cloud.google.com/apis/credentials",
		helpLabel: "Open Google credentials",
	},
	{
		id: "garmin",
		label: "Garmin",
		status: "Planned",
		description: "Activities, HRV, sleep, stress, training, and wearable health metrics.",
		href: "/settings/source/garmin",
		authType: "coming_soon",
		fields: [],
		helpText: "Garmin requires official developer/partner access. This is a placeholder.",
	},
	{
		id: "oura",
		label: "Oura",
		status: "Planned",
		description: "Sleep, readiness, HRV, resting heart rate, and recovery trends.",
		href: "/settings/source/oura",
		authType: "coming_soon",
		fields: [],
		helpText: "Oura support can be added as a future recovery source.",
	},
	{
		id: "whoop",
		label: "Whoop",
		status: "Planned",
		description: "Recovery, strain, sleep, HRV, and daily readiness context.",
		href: "/settings/source/whoop",
		authType: "coming_soon",
		fields: [],
		helpText: "Whoop support can be added as a future recovery source.",
	},
];

const LLM_SETTINGS: SettingsCard[] = [
	{
		id: "openai",
		label: "OpenAI",
		status: "Planned",
		description: "Use your OpenAI key for nutrition and training insights.",
		href: "/settings/llm/openai",
		guidance: ["Model examples: gpt-4o-mini, gpt-4.1-mini", "Base URL: https://api.openai.com/v1"],
	},
	{
		id: "claude",
		label: "Claude / Anthropic",
		status: "Planned",
		description: "Use your Anthropic key for careful, concise insight writing.",
		href: "/settings/llm/claude",
		guidance: ["Model examples: claude-3-5-haiku-latest, claude-3-5-sonnet-latest", "Base URL: https://api.anthropic.com"],
	},
	{
		id: "gemini",
		label: "Gemini",
		status: "Planned",
		description: "Use Gemini models for AI-generated OneHealth insights.",
		href: "/settings/llm/gemini",
		guidance: ["Model examples: gemini-1.5-flash, gemini-2.0-flash", "Get keys from Google AI Studio."],
	},
	{
		id: "nvidia_nim",
		label: "NVIDIA NIM",
		status: "Planned",
		description: "Use NVIDIA-hosted open models with your own API key.",
		href: "/settings/llm/nvidia_nim",
		guidance: ["Model examples: meta/llama-3.1-70b-instruct, qwen/qwen2.5-coder-32b-instruct", "Copy the model ID exactly from NVIDIA Build."],
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		status: "Planned",
		description: "Use OpenRouter to choose from many hosted models.",
		href: "/settings/llm/openrouter",
		guidance: ["Model examples: openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, qwen/qwen-2.5-72b-instruct", "Base URL: https://openrouter.ai/api/v1"],
	},
	{
		id: "groq",
		label: "Groq",
		status: "Planned",
		description: "Use Groq-hosted fast inference models for short insights.",
		href: "/settings/llm/groq",
		guidance: ["Model examples: llama-3.1-8b-instant, llama-3.3-70b-versatile", "Base URL: https://api.groq.com/openai/v1"],
	},
	{
		id: "google_ai_studio",
		label: "Google AI Studio",
		status: "Planned",
		description: "Use Google AI Studio API keys for Gemini-family models.",
		href: "/settings/llm/google_ai_studio",
		guidance: ["Model examples: gemini-1.5-flash, gemini-2.0-flash", "Use the API key from AI Studio, not Google login OAuth."],
	},
];

const MESSAGING_SETTINGS: SettingsCard[] = [
	{
		id: "telegram",
		label: "Telegram",
		status: "Planned",
		description: "Receive nutrition check-ins and future AI insights in Telegram.",
		href: "/settings/messaging/telegram",
	},
];

function settingsShell(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title} - OneHealth_MCP</title>
	<style>
		:root {
			color-scheme: dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			--bg: #080b10;
			--panel: #10151f;
			--panel-2: #151b27;
			--line: #273142;
			--text: #f5f7fb;
			--muted: #aab4c5;
			--soft: #d7deea;
			--green: #8ee6b1;
			--blue: #9db9ff;
			--amber: #ffd38a;
			--red: #ffb4b4;
			--ink: #091019;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			color: var(--text);
			background:
				radial-gradient(circle at 82% 0%, rgba(157, 185, 255, 0.18), transparent 30rem),
				linear-gradient(180deg, #0c1119 0%, var(--bg) 46%, #07090d 100%);
		}
		a { color: inherit; text-decoration: none; }
		.shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
		nav {
			position: sticky;
			top: 0;
			z-index: 10;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(8, 11, 16, 0.82);
			backdrop-filter: blur(18px);
		}
		nav .shell {
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 72px;
			gap: 18px;
		}
		.brand {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			font-weight: 850;
		}
		.mark {
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			background: linear-gradient(135deg, var(--green), var(--blue));
			color: var(--ink);
			font-weight: 900;
		}
		.nav-links, .actions {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 10px;
		}
		.button, button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 42px;
			padding: 0 16px;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			font: inherit;
			font-weight: 750;
			white-space: nowrap;
		}
		.button.primary, button.primary {
			border-color: transparent;
			background: var(--text);
			color: var(--ink);
		}
		button.danger { color: var(--red); }
		button:disabled { cursor: not-allowed; opacity: 0.52; }
		main { padding: 58px 0 76px; }
		.hero {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
			gap: 30px;
			align-items: end;
			margin-bottom: 30px;
		}
		.eyebrow {
			color: var(--green);
			font-size: 0.76rem;
			font-weight: 820;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}
		h1 {
			margin: 14px 0 16px;
			font-size: clamp(3rem, 7vw, 6rem);
			line-height: 0.9;
			letter-spacing: 0;
		}
		h2, h3 { margin: 0; letter-spacing: 0; }
		p { color: var(--muted); line-height: 1.65; }
		.lede { max-width: 680px; margin: 0; font-size: 1.08rem; }
		.panel, .card {
			border: 1px solid rgba(255, 255, 255, 0.11);
			border-radius: 8px;
			background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
		}
		.panel { padding: 18px; }
		.section { margin-top: 30px; }
		.section-head {
			display: flex;
			justify-content: space-between;
			align-items: end;
			gap: 18px;
			margin-bottom: 14px;
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
			gap: 14px;
		}
		.card {
			display: flex;
			flex-direction: column;
			min-height: 210px;
			padding: 18px;
		}
		.card p { margin: 10px 0 18px; font-size: 0.94rem; }
		.guidance {
			display: grid;
			gap: 7px;
			margin: 0 0 18px;
			padding: 0;
			list-style: none;
		}
		.guidance li {
			color: var(--muted);
			font-size: 0.82rem;
			line-height: 1.45;
		}
		.status {
			display: inline-flex;
			align-self: flex-start;
			align-items: center;
			min-height: 25px;
			padding: 0 10px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 999px;
			background: rgba(255, 255, 255, 0.05);
			color: var(--green);
			font-size: 0.72rem;
			font-weight: 820;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		.card .button { margin-top: auto; }
		label {
			display: block;
			margin: 14px 0 7px;
			color: var(--soft);
			font-size: 0.82rem;
			font-weight: 780;
		}
		input, textarea {
			width: 100%;
			min-height: 44px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			padding: 10px 12px;
			font: inherit;
		}
		textarea { min-height: 94px; resize: vertical; }
		.row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
		.helper {
			margin-top: 14px;
			padding: 12px;
			border: 1px solid rgba(255, 211, 138, 0.22);
			border-radius: 8px;
			background: rgba(255, 211, 138, 0.06);
			color: var(--muted);
			font-size: 0.9rem;
		}
		#message { min-height: 24px; margin-top: 14px; color: var(--green); font-weight: 760; }
		footer {
			padding: 36px 0;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			color: var(--muted);
		}
		footer .shell {
			display: flex;
			justify-content: space-between;
			gap: 18px;
			flex-wrap: wrap;
		}
		@media (max-width: 760px) {
			.hero, .row { grid-template-columns: 1fr; }
			nav .shell { align-items: flex-start; flex-direction: column; padding: 14px 0; }
			h1 { font-size: clamp(3rem, 18vw, 4.2rem); }
		}
	</style>
</head>
<body>
	<nav>
		<div class="shell">
			<a class="brand" href="/">
				<span class="mark">1H</span>
				<span>OneHealth_MCP</span>
			</a>
			<div class="nav-links">
				<a class="button" href="/settings">Settings</a>
				<a class="button" href="/connections">Classic connections</a>
			</div>
		</div>
	</nav>
	${body}
	<footer>
		<div class="shell">
			<span>OneHealth_MCP settings</span>
			<span>Credentials are encrypted when active saving is enabled.</span>
		</div>
	</footer>
</body>
</html>`;
}

function renderSettingsCards(cards: SettingsCard[]): string {
	return cards
		.map(
			(card) => `<a class="card" href="${card.href}">
				<span class="status">${card.status}</span>
				<h3>${card.label}</h3>
				<p>${card.description}</p>
				${card.guidance?.length ? `<ul class="guidance">${card.guidance.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
				<span class="button">Manage</span>
			</a>`,
		)
		.join("");
}

function statusLabel(source?: "user_d1" | "worker_secret" | "missing"): string {
	if (source === "user_d1") return "Connected";
	if (source === "worker_secret") return "Server connected";
	return "Not connected";
}

async function getSettingsSession(c: { req: { header: (name: string) => string | undefined }; env: Env }): Promise<Props | null> {
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];
	if (!sessionToken) return null;
	const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");
	if (!sessionData || typeof sessionData !== "object" || !("login" in sessionData)) return null;
	return sessionData as Props;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const AI_PROVIDER_DEFAULTS: Record<AiProviderId, { baseUrl: string; model: string; help: string }> = {
	openai: {
		baseUrl: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		help: "Use the model name from the OpenAI model picker. OpenAI-compatible proxies can override the base URL.",
	},
	claude: {
		baseUrl: "https://api.anthropic.com",
		model: "claude-3-5-haiku-latest",
		help: "Use an Anthropic Console API key. Model names usually begin with claude-.",
	},
	gemini: {
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		model: "gemini-1.5-flash",
		help: "Use a Google AI Studio API key. The model field should be only the model name, not a full URL.",
	},
	nvidia_nim: {
		baseUrl: "https://integrate.api.nvidia.com/v1",
		model: "meta/llama-3.1-70b-instruct",
		help: "NVIDIA NIM model IDs include the publisher path. Copy the ID exactly from NVIDIA Build, for example qwen/qwen2.5-coder-32b-instruct.",
	},
	openrouter: {
		baseUrl: "https://openrouter.ai/api/v1",
		model: "openai/gpt-4o-mini",
		help: "OpenRouter model IDs include the provider path, for example anthropic/claude-3.5-sonnet.",
	},
	groq: {
		baseUrl: "https://api.groq.com/openai/v1",
		model: "llama-3.1-8b-instant",
		help: "Groq model names are listed in the Groq console. Keep the base URL as the OpenAI-compatible endpoint.",
	},
	google_ai_studio: {
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		model: "gemini-1.5-flash",
		help: "This uses the same Gemini API shape as Google AI Studio. Paste the API key from AI Studio.",
	},
};

utilityRoutes.get("/settings", (c) => {
	const categories: SettingsCard[] = [
		{
			id: "sources",
			label: "Fitness Apps & Wearables",
			status: "Data sources",
			description: "Connect health apps, nutrition trackers, training platforms, and wearable devices.",
			href: "/settings/sources",
		},
		{
			id: "ai",
			label: "AI Connections",
			status: "BYOK",
			description: "Add your own LLM API keys for future OneHealth nutrition and training insights.",
			href: "/settings/ai",
		},
		{
			id: "messages",
			label: "Messages",
			status: "Check-ins",
			description: "Connect Telegram and future messaging channels for scheduled insight delivery.",
			href: "/settings/messages",
		},
	];
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Control center</span>
				<h1>Settings for sources, AI, and messages.</h1>
				<p class="lede">Start with one of the three setup areas. Each area opens into provider cards where users can add the right details in the right place.</p>
			</div>
			<div class="panel">
				<strong>Simple setup path</strong>
				<p>Fitness credentials, AI keys, and messaging services stay separated so the page stays clear as OneHealth grows.</p>
			</div>
		</section>
		<section class="section">
			<div class="grid">${renderSettingsCards(categories)}</div>
		</section>
	</main>`;
	return c.html(settingsShell("Settings", body));
});

utilityRoutes.get("/settings/sources", async (c) => {
	const session = await getSettingsSession(c);
	const statusMap = new Map<string, { source: "user_d1" | "worker_secret" | "missing" }>();
	if (session) {
		const statuses = await getOneHealthServiceStatuses(c.env, session);
		for (const status of statuses) statusMap.set(status.id, status);
	}
	const cards = SOURCE_SETTINGS.map((source) => {
		const status = statusMap.get(source.id);
		const isComingSoon = source.authType === "coming_soon";
		return {
			...source,
			status: isComingSoon ? "Coming soon" : session ? statusLabel(status?.source) : "Sign in required",
		};
	});
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Fitness apps and wearables</span>
				<h1>Connect data sources.</h1>
				<p class="lede">Add credentials for fitness apps, wearables, nutrition trackers, and training platforms. Valid saved credentials show as connected.</p>
			</div>
			<div class="panel">
				<strong>${session ? `Signed in as @${session.login}` : "Sign in required"}</strong>
				<p>${session ? "Connection status reflects your encrypted account credentials plus server-level credentials." : "Sign in to view live connection status and save credentials."}</p>
			</div>
		</section>
		<section class="section">
			<div class="grid">${renderSettingsCards(cards)}</div>
		</section>
	</main>`;
	return c.html(settingsShell("Fitness Apps & Wearables", body));
});

utilityRoutes.get("/settings/ai", async (c) => {
	const session = await getSettingsSession(c);
	const connected = new Set<AiProviderId>();
	if (session) {
		for (const connection of await listAiConnectionSummaries(c.env, session)) {
			if (connection.enabled) connected.add(connection.provider);
		}
	}
	const cards = LLM_SETTINGS.map((provider) => ({
		...provider,
		status: session ? connected.has(provider.id as AiProviderId) ? "Connected" : "Setup pending" : "Sign in required",
	}));
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">AI connections</span>
				<h1>Bring your own model key.</h1>
				<p class="lede">Choose an LLM provider for future OneHealth nutrition insights, Telegram summaries, and training explanations.</p>
			</div>
			<div class="panel">
				<strong>${session ? `Signed in as @${escapeHtml(session.login)}` : "Sign in required"}</strong>
				<p>${session ? "API keys are encrypted per user. Model names are shown with examples on each provider card." : "Sign in before saving LLM API details."}</p>
			</div>
		</section>
		<section class="section">
			<div class="grid">${renderSettingsCards(cards)}</div>
		</section>
	</main>`;
	return c.html(settingsShell("AI Connections", body));
});

utilityRoutes.get("/settings/messages", async (c) => {
	const session = await getSettingsSession(c);
	const telegram = session ? await getTelegramConnection(c.env, session) : null;
	const cards = MESSAGING_SETTINGS.map((service) => ({
		...service,
		status: session ? telegram?.enabled ? "Connected" : "Setup pending" : "Sign in required",
	}));
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Messages</span>
				<h1>Send insights where users already are.</h1>
				<p class="lede">Connect Telegram now as the first messaging channel placeholder, with WhatsApp and other channels possible later.</p>
			</div>
			<div class="panel">
				<strong>${telegram?.enabled ? "Telegram connected" : "Telegram first"}</strong>
				<p>${telegram?.enabled ? "Nutrition insight schedules can now send to Telegram." : "The setup flow uses a bot deep link and short-lived code. Users do not need to paste chat IDs."}</p>
			</div>
		</section>
		<section class="section">
			<div class="grid">${renderSettingsCards(cards)}</div>
		</section>
	</main>`;
	return c.html(settingsShell("Messages", body));
});

utilityRoutes.get("/settings/source/:id", (c) => {
	const id = c.req.param("id");
	const source = SOURCE_SETTINGS.find((item) => item.id === id);
	if (!source) return c.text("Unknown source", 404);
	const isActive = source.authType !== "coming_soon";
	const fields = source.fields
		.map((field) => {
			const type = /password|secret|token|key/i.test(field) ? "password" : "text";
			const label = field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
			return `<label for="${field}">${label}</label><input id="${field}" name="${field}" type="${type}" autocomplete="off" placeholder="${label}">`;
		})
		.join("");
	const helpLink = source.helpUrl
		? `<a class="button" href="${source.helpUrl}" target="_blank" rel="noreferrer">${source.helpLabel ?? "Open provider"}</a>`
		: "";
	const oauthLink = ["fitbit", "google_fit"].includes(source.id)
		? `<a class="button" href="/connect/${source.id}">OAuth connect</a>`
		: "";
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Fitness source</span>
				<h1>${source.label}</h1>
				<p class="lede">${source.description}</p>
			</div>
			<div class="panel">
				<strong>${source.status}</strong>
				<p>${source.helpText}</p>
			</div>
		</section>
		<form class="panel" id="sourceForm">
			${fields || `<div class="helper">This provider is planned. Credential fields will appear after the integration is approved and ready.</div>`}
			<div class="actions">
				<button class="primary" type="submit" ${isActive ? "" : "disabled"}>Save ${source.label}</button>
				${oauthLink}
				${helpLink}
				<a class="button" href="/settings">Back to settings</a>
			</div>
			<div id="message"></div>
		</form>
	</main>
	<script>
		const source = ${JSON.stringify(source)};
		const form = document.getElementById("sourceForm");
		const message = document.getElementById("message");
		form?.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (source.authType === "coming_soon") return;
			const credentials = {};
			for (const field of source.fields) {
				const value = form.elements[field]?.value?.trim();
				if (value) credentials[field] = value;
			}
			const response = await fetch("/api/connections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ serviceId: source.id, authType: source.authType, credentials }),
			});
			const data = await response.json().catch(() => ({}));
			message.textContent = response.ok ? "Saved connection." : (data.error || "Could not save connection. Sign in first if needed.");
		});
	</script>`;
	return c.html(settingsShell(source.label, body));
});

utilityRoutes.get("/settings/llm/:id", async (c) => {
	const id = c.req.param("id");
	const provider = LLM_SETTINGS.find((item) => item.id === id);
	if (!provider) return c.text("Unknown LLM provider", 404);
	const session = await getSettingsSession(c);
	const connection = session ? (await listAiConnectionSummaries(c.env, session)).find((item) => item.provider === provider.id) : null;
	const defaults = AI_PROVIDER_DEFAULTS[provider.id as AiProviderId];
	const guidance = provider.guidance?.map((item) => `<li>${escapeHtml(item)}</li>`).join("") ?? "";
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">LLM provider</span>
				<h1>${provider.label}</h1>
				<p class="lede">${provider.description}</p>
			</div>
			<div class="panel">
				<strong>${connection?.enabled ? "Connected" : session ? "Setup pending" : "Sign in required"}</strong>
				<p>${escapeHtml(defaults.help)}</p>
			</div>
		</section>
		<form class="panel" id="aiForm">
			<label for="apiKey">API key</label>
			<textarea id="apiKey" name="apiKey" placeholder="${connection ? "Leave blank to keep the saved key" : `Paste ${provider.label} API key`}"></textarea>
			<div class="row">
				<div>
					<label for="model">Model</label>
					<input id="model" name="model" value="${escapeHtml(connection?.modelName ?? defaults.model)}" placeholder="${escapeHtml(defaults.model)}">
				</div>
				<div>
					<label for="baseUrl">Base URL</label>
					<input id="baseUrl" name="baseUrl" value="${escapeHtml(connection?.baseUrl ?? defaults.baseUrl)}" placeholder="${escapeHtml(defaults.baseUrl)}">
				</div>
			</div>
			<div class="helper">
				<ul class="guidance">${guidance}</ul>
				<div>Use the model name exactly as the provider displays it. For NVIDIA NIM and OpenRouter, that usually includes a provider prefix such as <strong>qwen/...</strong> or <strong>openai/...</strong>.</div>
			</div>
			<div class="actions">
				<button class="primary" type="submit" ${session ? "" : "disabled"}>Save ${provider.label}</button>
				<button type="button" id="deleteAi" class="danger" ${connection ? "" : "disabled"}>Delete saved key</button>
				<a class="button" href="/settings">Back to settings</a>
			</div>
			<div id="message"></div>
		</form>
	</main>
	<script>
		const provider = ${JSON.stringify(provider.id)};
		const form = document.getElementById("aiForm");
		const message = document.getElementById("message");
		form?.addEventListener("submit", async (event) => {
			event.preventDefault();
			const apiKey = form.elements.apiKey.value.trim();
			const modelName = form.elements.model.value.trim();
			const baseUrl = form.elements.baseUrl.value.trim();
			const response = await fetch("/api/ai-connections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, apiKey, modelName, baseUrl, keepExistingKey: ${connection ? "true" : "false"} }),
			});
			const data = await response.json().catch(() => ({}));
			message.textContent = response.ok ? "Saved AI connection." : (data.error || "Could not save AI connection.");
		});
		document.getElementById("deleteAi")?.addEventListener("click", async () => {
			const response = await fetch("/api/ai-connections/" + provider, { method: "DELETE" });
			const data = await response.json().catch(() => ({}));
			message.textContent = response.ok ? "Deleted AI connection." : (data.error || "Could not delete AI connection.");
		});
	</script>`;
	return c.html(settingsShell(provider.label, body));
});

utilityRoutes.get("/settings/messaging/:id", async (c) => {
	const id = c.req.param("id");
	const service = MESSAGING_SETTINGS.find((item) => item.id === id);
	if (!service) return c.text("Unknown messaging service", 404);
	const session = await getSettingsSession(c);
	const telegram = session ? await getTelegramConnection(c.env, session) : null;
	const schedule = session ? await getNotificationSchedule(c.env, session) : null;
	const times = schedule?.times.length ? schedule.times : ["06:00", "10:00", "15:00", "22:00"];
	const body = `<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Messaging</span>
				<h1>${service.label}</h1>
				<p class="lede">${service.description}</p>
			</div>
			<div class="panel">
				<strong>${telegram?.enabled ? "Connected" : session ? "Ready to connect" : "Sign in required"}</strong>
				<p>${telegram?.externalUsername ? `Linked to @${escapeHtml(telegram.externalUsername)}.` : "Users click Connect Telegram, open the OneHealth bot, and link with a short-lived code. No chat ID paste required."}</p>
			</div>
		</section>
		<div class="panel">
			<div class="actions">
				<button class="primary" id="connectTelegram" type="button" ${session ? "" : "disabled"}>${telegram?.enabled ? "Reconnect Telegram" : "Connect Telegram"}</button>
				<a class="button" href="/settings/messages">Back to messages</a>
			</div>
			<div class="helper" id="telegramLinkMessage">A Telegram bot token and bot username must be configured in Cloudflare before the deep link can be used in production.</div>
		</div>
		<form class="panel" id="scheduleForm">
			<label>
				<input id="enabled" name="enabled" type="checkbox" ${schedule?.enabled ? "checked" : ""} style="width:auto; min-height:auto; margin-right:8px;">
				Enable nutrition insight pushes
			</label>
			<div class="row">
				<div>
					<label for="timezone">Timezone</label>
					<input id="timezone" name="timezone" value="${escapeHtml(schedule?.timezone ?? "America/New_York")}" placeholder="America/New_York">
				</div>
				<div>
					<label for="insightMode">Insight mode</label>
					<input id="insightMode" name="insightMode" value="${escapeHtml(schedule?.insightMode ?? "smart")}" placeholder="smart">
				</div>
			</div>
			<label>Insight times</label>
			<div id="times">${times.map((time) => `<div class="row time-row"><input name="times" value="${escapeHtml(time)}" placeholder="HH:MM"><button type="button" data-remove-time>Remove</button></div>`).join("")}</div>
			<div class="actions">
				<button type="button" id="addTime">Add time</button>
				<button class="primary" type="submit" ${session ? "" : "disabled"}>Save schedule</button>
			</div>
			<div class="helper">This page is ready for Telegram bot token setup, link-code generation, test messages, and nutrition check-ins.</div>
			<div id="message"></div>
		</form>
	</main>
	<script>
		const linkMessage = document.getElementById("telegramLinkMessage");
		document.getElementById("connectTelegram")?.addEventListener("click", async () => {
			const response = await fetch("/api/telegram/link-code", { method: "POST" });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				linkMessage.textContent = data.error || "Could not create Telegram link.";
				return;
			}
			linkMessage.innerHTML = 'Open Telegram and tap Start: <a href="' + data.botUrl + '" target="_blank" rel="noreferrer">' + data.botUrl + '</a>';
			window.open(data.botUrl, "_blank", "noopener,noreferrer");
		});
		const times = document.getElementById("times");
		document.getElementById("addTime")?.addEventListener("click", () => {
			const row = document.createElement("div");
			row.className = "row time-row";
			row.innerHTML = '<input name="times" value="12:00" placeholder="HH:MM"><button type="button" data-remove-time>Remove</button>';
			times.appendChild(row);
		});
		times?.addEventListener("click", (event) => {
			if (event.target.dataset?.removeTime !== undefined) event.target.closest(".time-row")?.remove();
		});
		document.getElementById("scheduleForm")?.addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			const payload = {
				enabled: form.elements.enabled.checked,
				timezone: form.elements.timezone.value.trim(),
				insightMode: form.elements.insightMode.value.trim(),
				times: Array.from(form.querySelectorAll('input[name="times"]')).map((input) => input.value.trim()),
			};
			const response = await fetch("/api/notification-schedule", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await response.json().catch(() => ({}));
			document.getElementById("message").textContent = response.ok ? "Saved notification schedule." : (data.error || "Could not save schedule.");
		});
	</script>`;
	return c.html(settingsShell(service.label, body));
});

utilityRoutes.get("/api/ai-connections", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const connections = await listAiConnectionSummaries(c.env, session);
	return c.json({ connections });
});

utilityRoutes.post("/api/ai-connections", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	try {
		const body = await c.req.json();
		const provider = body.provider as AiProviderId;
		if (!AI_PROVIDER_DEFAULTS[provider]) return c.json({ error: "Unknown AI provider." }, 400);
		const modelName = typeof body.modelName === "string" ? body.modelName.trim() : "";
		const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
		let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
		if (!modelName) return c.json({ error: "Model name is required." }, 400);
		if (!apiKey && body.keepExistingKey) {
			const existing = (await listAiConnectionSummaries(c.env, session)).find((item) => item.provider === provider);
			if (existing) {
				apiKey = (await getAiConnection(c.env, session, provider))?.apiKey ?? "";
			}
		}
		if (!apiKey) return c.json({ error: "API key is required." }, 400);
		await upsertAiConnection(c.env, session, {
			provider,
			apiKey,
			baseUrl,
			modelName,
			enabled: true,
		});
		return c.json({ success: true });
	} catch (error) {
		console.error("AI connection save failed:", error);
		return c.json({ error: "Could not save AI connection." }, 500);
	}
});

utilityRoutes.delete("/api/ai-connections/:provider", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const provider = c.req.param("provider") as AiProviderId;
	if (!AI_PROVIDER_DEFAULTS[provider]) return c.json({ error: "Unknown AI provider." }, 400);
	await deleteAiConnection(c.env, session, provider);
	return c.json({ success: true });
});

utilityRoutes.post("/api/telegram/link-code", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	if (!c.env.TELEGRAM_BOT_USERNAME) {
		return c.json({ error: "TELEGRAM_BOT_USERNAME must be configured before Telegram linking is available." }, 503);
	}
	const code = await createTelegramLinkCode(c.env, session);
	const botUrl = `https://t.me/${encodeURIComponent(c.env.TELEGRAM_BOT_USERNAME)}?start=${encodeURIComponent(code)}`;
	return c.json({ code, botUrl, expiresInSeconds: 600 });
});

utilityRoutes.post("/api/telegram/webhook", async (c) => {
	if (c.env.TELEGRAM_WEBHOOK_SECRET) {
		const token = c.req.header("X-Telegram-Bot-Api-Secret-Token");
		if (token !== c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ ok: false }, 401);
	}
	const update = await c.req.json().catch(() => null) as {
		message?: {
			text?: string;
			chat?: { id?: number | string; username?: string };
			from?: { username?: string };
		};
	} | null;
	const text = update?.message?.text ?? "";
	const match = text.match(/^\/start\s+([a-f0-9]{18})/i);
	const chatId = update?.message?.chat?.id;
	if (!match || chatId === undefined) return c.json({ ok: true });
	const userId = await consumeTelegramLinkCode(c.env, match[1]);
	if (!userId) return c.json({ ok: true });
	await upsertTelegramConnection(c.env, userId, {
		externalUserId: String(chatId),
		externalUsername: update?.message?.chat?.username ?? update?.message?.from?.username,
		enabled: true,
	});
	return c.json({ ok: true });
});

utilityRoutes.get("/api/notification-schedule", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const [telegram, schedule] = await Promise.all([
		getTelegramConnection(c.env, session),
		getNotificationSchedule(c.env, session),
	]);
	return c.json({ telegram, schedule });
});

utilityRoutes.post("/api/notification-schedule", async (c) => {
	const session = await getSettingsSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	try {
		const body = await c.req.json();
		const times = normalizeNotificationTimes(body.times);
		if (times.length === 0) return c.json({ error: "Add at least one valid time in HH:MM format." }, 400);
		await upsertNotificationSchedule(c.env, session, {
			enabled: Boolean(body.enabled),
			timezone: normalizeTimezone(body.timezone),
			times,
			insightMode: normalizeInsightMode(body.insightMode),
		});
		return c.json({ success: true });
	} catch (error) {
		console.error("Notification schedule save failed:", error);
		return c.json({ error: "Could not save notification schedule." }, 500);
	}
});

utilityRoutes.get("/settings-old", (c) => {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="description" content="Configure OneHealth_MCP fitness apps, LLM providers, and messaging integrations.">
	<title>Settings - OneHealth_MCP</title>
	<style>
		:root {
			color-scheme: dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			--bg: #080b10;
			--panel: #10151f;
			--panel-2: #151b27;
			--line: #273142;
			--text: #f5f7fb;
			--muted: #aab4c5;
			--soft: #d7deea;
			--green: #8ee6b1;
			--blue: #9db9ff;
			--amber: #ffd38a;
			--ink: #091019;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			color: var(--text);
			background:
				radial-gradient(circle at 82% 0%, rgba(157, 185, 255, 0.18), transparent 30rem),
				linear-gradient(180deg, #0c1119 0%, var(--bg) 46%, #07090d 100%);
		}
		a { color: inherit; text-decoration: none; }
		.shell {
			width: min(1120px, calc(100% - 32px));
			margin: 0 auto;
		}
		nav {
			position: sticky;
			top: 0;
			z-index: 10;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(8, 11, 16, 0.82);
			backdrop-filter: blur(18px);
		}
		nav .shell {
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 72px;
			gap: 18px;
		}
		.brand {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			font-weight: 850;
		}
		.mark {
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			background: linear-gradient(135deg, var(--green), var(--blue));
			color: var(--ink);
			font-weight: 900;
		}
		.nav-links {
			display: flex;
			align-items: center;
			gap: 10px;
		}
		.button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 42px;
			padding: 0 16px;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			font-weight: 750;
			white-space: nowrap;
		}
		.button.primary {
			border-color: transparent;
			background: var(--text);
			color: var(--ink);
		}
		main {
			padding: 64px 0 76px;
		}
		.hero {
			display: grid;
			grid-template-columns: minmax(0, 0.85fr) minmax(320px, 0.55fr);
			gap: 34px;
			align-items: end;
			margin-bottom: 34px;
		}
		.eyebrow {
			color: var(--green);
			font-size: 0.76rem;
			font-weight: 820;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}
		h1 {
			margin: 14px 0 16px;
			font-size: clamp(3rem, 7vw, 6.2rem);
			line-height: 0.9;
			letter-spacing: 0;
		}
		p {
			color: var(--muted);
			line-height: 1.65;
		}
		.lede {
			max-width: 660px;
			margin: 0;
			font-size: 1.08rem;
		}
		.status-panel {
			padding: 18px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.04);
		}
		.status-panel strong {
			display: block;
			margin-bottom: 8px;
			font-size: 1.05rem;
		}
		.status-panel p {
			margin: 0;
			font-size: 0.94rem;
		}
		.settings-grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 16px;
		}
		.card {
			min-height: 100%;
			padding: 22px;
			border: 1px solid rgba(255, 255, 255, 0.11);
			border-radius: 8px;
			background: var(--panel);
		}
		.card h2 {
			margin: 0 0 10px;
			font-size: 1.35rem;
			letter-spacing: 0;
		}
		.card p {
			margin: 0 0 18px;
			font-size: 0.94rem;
		}
		label {
			display: block;
			margin: 14px 0 7px;
			color: var(--soft);
			font-size: 0.82rem;
			font-weight: 780;
		}
		input, select, textarea {
			width: 100%;
			min-height: 42px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			padding: 10px 12px;
			font: inherit;
		}
		textarea {
			min-height: 86px;
			resize: vertical;
		}
		select option {
			color: #111827;
		}
		.row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
		.helper {
			margin-top: 12px;
			padding: 12px;
			border: 1px solid rgba(255, 211, 138, 0.22);
			border-radius: 8px;
			background: rgba(255, 211, 138, 0.06);
			color: var(--muted);
			font-size: 0.88rem;
		}
		.provider-list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 14px;
		}
		.chip {
			display: inline-flex;
			align-items: center;
			min-height: 30px;
			padding: 0 10px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 999px;
			background: rgba(255, 255, 255, 0.05);
			color: var(--soft);
			font-size: 0.82rem;
			font-weight: 720;
		}
		.card-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 10px;
			margin-top: 18px;
		}
		.disabled {
			opacity: 0.62;
			cursor: not-allowed;
		}
		footer {
			padding: 36px 0;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			color: var(--muted);
		}
		footer .shell {
			display: flex;
			justify-content: space-between;
			gap: 18px;
			flex-wrap: wrap;
		}
		@media (max-width: 980px) {
			.hero, .settings-grid {
				grid-template-columns: 1fr;
			}
		}
		@media (max-width: 560px) {
			.shell {
				width: min(100% - 24px, 1120px);
			}
			nav .shell {
				align-items: flex-start;
				flex-direction: column;
				padding: 14px 0;
			}
			.nav-links {
				width: 100%;
				display: grid;
				grid-template-columns: 1fr 1fr;
			}
			.row {
				grid-template-columns: 1fr;
			}
			h1 {
				font-size: clamp(3rem, 18vw, 4.2rem);
			}
		}
	</style>
</head>
<body>
	<nav>
		<div class="shell">
			<a class="brand" href="/">
				<span class="mark">1H</span>
				<span>OneHealth_MCP</span>
			</a>
			<div class="nav-links" aria-label="Settings navigation">
				<a class="button" href="/connections">Connections</a>
				<a class="button primary" href="/settings">Settings</a>
			</div>
		</div>
	</nav>

	<main class="shell">
		<section class="hero">
			<div>
				<span class="eyebrow">Account setup</span>
				<h1>Settings for sources, AI, and messages.</h1>
				<p class="lede">Keep app credentials, LLM provider details, and messaging services in one place. These fields are prepared for the next encrypted settings upgrade.</p>
			</div>
			<div class="status-panel">
				<strong>Coming next</strong>
				<p>Saving, encryption, and test actions will be connected to the existing per-user credential store after you confirm the final provider list and Telegram flow.</p>
			</div>
		</section>

		<section class="settings-grid" aria-label="OneHealth settings">
			<form class="card">
				<span class="eyebrow">Fitness sources</span>
				<h2>Fitness apps and wearables</h2>
				<p>Add API details for fitness apps, wearables, nutrition tools, and training platforms.</p>

				<label for="fitness-provider">Service type</label>
				<select id="fitness-provider" name="fitness-provider">
					<option>Fitness app</option>
					<option>Wearable</option>
					<option>Nutrition tracker</option>
					<option>Training platform</option>
				</select>

				<label for="fitness-name">App or device name</label>
				<input id="fitness-name" name="fitness-name" placeholder="Cronometer, Strava, Garmin, Fitbit, Oura" autocomplete="off">

				<label for="fitness-api">API key or token</label>
				<textarea id="fitness-api" name="fitness-api" placeholder="Paste API key, access token, or refresh token"></textarea>

				<div class="row">
					<div>
						<label for="fitness-username">Username</label>
						<input id="fitness-username" name="fitness-username" placeholder="Optional username" autocomplete="username">
					</div>
					<div>
						<label for="fitness-password">Password</label>
						<input id="fitness-password" name="fitness-password" type="password" placeholder="Optional password" autocomplete="current-password">
					</div>
				</div>

				<div class="helper">Use the Connections page for active integrations today. This settings box is reserved for the broader encrypted credential manager.</div>
				<div class="card-actions">
					<button class="button primary disabled" type="button" disabled>Save source details soon</button>
				</div>
			</form>

			<form class="card">
				<span class="eyebrow">AI insight provider</span>
				<h2>LLM API details</h2>
				<p>Bring your own model key for future nutrition and training insights.</p>

				<label for="llm-provider">Provider</label>
				<select id="llm-provider" name="llm-provider">
					<option>OpenAI</option>
					<option>Claude / Anthropic</option>
					<option>Gemini</option>
					<option>NVIDIA NIM</option>
					<option>OpenRouter</option>
					<option>Groq</option>
					<option>Google AI Studio</option>
				</select>

				<label for="llm-api-key">API key</label>
				<textarea id="llm-api-key" name="llm-api-key" placeholder="Paste your LLM API key"></textarea>

				<div class="row">
					<div>
						<label for="llm-model">Model</label>
						<input id="llm-model" name="llm-model" placeholder="gpt-4.1-mini, claude-3.5, llama, gemini" autocomplete="off">
					</div>
					<div>
						<label for="llm-base-url">Base URL</label>
						<input id="llm-base-url" name="llm-base-url" placeholder="Optional custom endpoint" autocomplete="off">
					</div>
				</div>

				<div class="provider-list" aria-label="Supported LLM providers">
					<span class="chip">OpenAI</span>
					<span class="chip">Claude</span>
					<span class="chip">Gemini</span>
					<span class="chip">NVIDIA NIM</span>
					<span class="chip">OpenRouter</span>
					<span class="chip">Groq</span>
					<span class="chip">Google AI Studio</span>
				</div>
				<div class="helper">LLM details will power future AI-generated insights. For now, no LLM keys are stored from this placeholder form.</div>
				<div class="card-actions">
					<button class="button primary disabled" type="button" disabled>Save LLM details soon</button>
					<button class="button disabled" type="button" disabled>Test insight soon</button>
				</div>
			</form>

			<form class="card">
				<span class="eyebrow">Messaging</span>
				<h2>Notification services</h2>
				<p>Connect messaging channels for nutrition check-ins, summaries, and future AI insights.</p>

				<label for="message-service">Messaging service</label>
				<select id="message-service" name="message-service">
					<option>Telegram</option>
				</select>

				<label for="telegram-status">Telegram</label>
				<input id="telegram-status" name="telegram-status" value="Placeholder - deep-link bot connection coming soon" readonly>

				<label for="message-frequency">Insight window</label>
				<select id="message-frequency" name="message-frequency">
					<option>Every 4 hours</option>
					<option>Daily summary</option>
					<option>Paused</option>
				</select>

				<div class="helper">Telegram will use a bot deep link instead of asking users to paste chat IDs. This keeps the setup simple and familiar.</div>
				<div class="card-actions">
					<button class="button primary disabled" type="button" disabled>Connect Telegram soon</button>
					<button class="button disabled" type="button" disabled>Send test message soon</button>
				</div>
			</form>
		</section>
	</main>

	<footer>
		<div class="shell">
			<span>OneHealth_MCP settings</span>
			<span>Secrets will be encrypted before active storage is enabled.</span>
		</div>
	</footer>
</body>
</html>`;

	return c.html(html);
});

utilityRoutes.get("/", (c) => {
	const googleReady = Boolean(c.env.GOOGLE_LOGIN_CLIENT_ID && c.env.GOOGLE_LOGIN_CLIENT_SECRET);
	const googleHeroButton = googleReady
		? `<a class="button google" href="/auth/google?return_to=/connections">Continue with Google</a>`
		: `<a class="button google" href="/signup">Google setup pending</a>`;
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="description" content="OneHealth_MCP connects your fitness apps to Claude, ChatGPT, and any MCP client through one private endpoint.">
	<title>OneHealth_MCP - Health data for AI agents</title>
	<style>
		:root {
			color-scheme: dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			--bg: #080b10;
			--panel: #10151f;
			--panel-2: #151b27;
			--line: #273142;
			--text: #f5f7fb;
			--muted: #aab4c5;
			--soft: #d7deea;
			--green: #8ee6b1;
			--blue: #9db9ff;
			--amber: #ffd38a;
			--ink: #091019;
		}

		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			color: var(--text);
			background:
				radial-gradient(circle at 80% 4%, rgba(157, 185, 255, 0.2), transparent 30rem),
				linear-gradient(180deg, #0c1119 0%, var(--bg) 42%, #07090d 100%);
		}

		a {
			color: inherit;
			text-decoration: none;
		}

		.shell {
			width: min(1180px, calc(100% - 32px));
			margin: 0 auto;
		}

		.notice {
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(8, 11, 16, 0.72);
			backdrop-filter: blur(18px);
		}

		.notice .shell {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 10px;
			min-height: 40px;
			color: var(--soft);
			font-size: 0.88rem;
		}

		.pill {
			display: inline-flex;
			align-items: center;
			min-height: 24px;
			padding: 0 10px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 999px;
			color: var(--green);
			background: rgba(142, 230, 177, 0.08);
			font-size: 0.76rem;
			font-weight: 750;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			white-space: nowrap;
		}

		nav {
			position: sticky;
			top: 0;
			z-index: 10;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(8, 11, 16, 0.78);
			backdrop-filter: blur(18px);
		}

		nav .shell {
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 72px;
			gap: 22px;
		}

		.brand {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			font-weight: 850;
			letter-spacing: 0;
		}

		.mark {
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border: 1px solid rgba(255, 255, 255, 0.18);
			border-radius: 8px;
			background: linear-gradient(135deg, var(--green), var(--blue));
			color: var(--ink);
			font-weight: 900;
		}

		.nav-links {
			display: flex;
			align-items: center;
			gap: 24px;
			color: var(--muted);
			font-size: 0.92rem;
		}

		.nav-actions {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 42px;
			padding: 0 16px;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text);
			font-weight: 750;
			white-space: nowrap;
		}

		.button.primary {
			border-color: transparent;
			background: var(--text);
			color: var(--ink);
		}

		.button.google {
			border-color: rgba(142, 230, 177, 0.32);
			background: rgba(142, 230, 177, 0.09);
			color: var(--text);
		}

		.auth-row {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 10px;
			margin-top: 28px;
		}

		.auth-note {
			width: 100%;
			margin: 2px 0 0;
			color: var(--muted);
			font-size: 0.9rem;
		}

		.hero {
			display: grid;
			grid-template-columns: minmax(0, 0.95fr) minmax(360px, 1.05fr);
			align-items: center;
			gap: 42px;
			padding: 86px 0 44px;
			min-height: calc(100vh - 112px);
		}

		h1 {
			max-width: 720px;
			margin: 18px 0 18px;
			font-size: clamp(3.4rem, 8vw, 7.2rem);
			line-height: 0.9;
			letter-spacing: 0;
		}

		p {
			color: var(--muted);
			line-height: 1.65;
		}

		.lede {
			max-width: 620px;
			margin: 0;
			font-size: clamp(1.08rem, 2vw, 1.28rem);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 10px;
			margin-top: 30px;
		}

		.micro {
			display: flex;
			flex-wrap: wrap;
			gap: 12px;
			margin-top: 16px;
			color: var(--muted);
			font-size: 0.92rem;
		}

		.hero-card {
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
			box-shadow: 0 34px 90px rgba(0, 0, 0, 0.32);
			overflow: hidden;
		}

		.chat-bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 14px;
			padding: 14px 16px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			color: var(--muted);
			font-size: 0.86rem;
		}

		.chat-body {
			padding: 20px;
		}

		.prompt, .answer {
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			padding: 16px;
			background: rgba(8, 11, 16, 0.68);
		}

		.prompt {
			color: var(--text);
			font-size: 1.25rem;
			font-weight: 780;
		}

		.tool {
			display: inline-flex;
			margin: 16px 0 10px;
			padding: 6px 10px;
			border-radius: 999px;
			background: rgba(157, 185, 255, 0.12);
			color: var(--blue);
			font-size: 0.8rem;
			font-weight: 760;
		}

		.answer {
			color: var(--soft);
		}

		.metrics {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 10px;
			margin-top: 14px;
		}

		.metric {
			padding: 12px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.04);
		}

		.metric strong {
			display: block;
			margin-top: 4px;
			font-size: 1.22rem;
			color: var(--text);
		}

		.stat-strip {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 16px;
			padding: 22px 0 70px;
		}

		.stat {
			padding: 18px;
			border-top: 1px solid rgba(255, 255, 255, 0.12);
		}

		.stat strong {
			display: block;
			margin-bottom: 6px;
			font-size: 1.45rem;
		}

		.section {
			padding: 82px 0;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
		}

		.section-head {
			display: grid;
			grid-template-columns: 0.75fr 1fr;
			gap: 36px;
			align-items: end;
			margin-bottom: 28px;
		}

		.eyebrow {
			color: var(--green);
			font-size: 0.76rem;
			font-weight: 820;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}

		h2 {
			margin: 10px 0 0;
			font-size: clamp(2.2rem, 5vw, 4.6rem);
			line-height: 0.98;
			letter-spacing: 0;
		}

		h3 {
			margin: 0;
			letter-spacing: 0;
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 16px;
		}

		.card {
			min-height: 220px;
			padding: 20px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			background: var(--panel);
		}

		.card p {
			margin-bottom: 0;
		}

		.step-number {
			display: block;
			margin-bottom: 22px;
			color: var(--amber);
			font-weight: 820;
		}

		code {
			padding: 3px 7px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 6px;
			background: rgba(255, 255, 255, 0.08);
			color: var(--soft);
		}

		.sources {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
			gap: 12px;
		}

		.source {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 14px 16px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			background: var(--panel-2);
		}

		.badge {
			color: var(--green);
			font-size: 0.72rem;
			font-weight: 820;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.recipes {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 12px;
		}

		.recipe {
			padding: 16px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.04);
			color: var(--soft);
		}

		.pricing {
			display: grid;
			grid-template-columns: 0.9fr 1.1fr;
			gap: 16px;
		}

		.price-card {
			padding: 24px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: var(--panel);
		}

		.price-card.featured {
			background: linear-gradient(180deg, rgba(142, 230, 177, 0.16), rgba(157, 185, 255, 0.08));
		}

		.price {
			margin: 16px 0;
			font-size: clamp(2rem, 5vw, 3.6rem);
			font-weight: 900;
			letter-spacing: 0;
		}

		.strike-price {
			display: inline-block;
			margin-right: 12px;
			color: var(--muted);
			font-size: 0.52em;
			text-decoration: line-through;
			text-decoration-thickness: 2px;
			vertical-align: middle;
		}

		ul {
			margin: 18px 0 0;
			padding: 0;
			list-style: none;
			color: var(--muted);
		}

		li {
			margin-top: 10px;
		}

		.cta {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 22px;
			align-items: center;
			padding: 42px;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			background: var(--text);
			color: var(--ink);
		}

		.cta p {
			color: #334155;
		}

		.cta .button {
			background: var(--ink);
			color: white;
			border-color: var(--ink);
		}

		.disclaimer {
			padding: 40px 0;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
		}

		.disclaimer-box {
			padding: 22px;
			border: 1px solid rgba(255, 211, 138, 0.24);
			border-radius: 8px;
			background: rgba(255, 211, 138, 0.06);
		}

		.disclaimer-box h2 {
			margin: 0 0 10px;
			color: var(--amber);
			font-size: 1.1rem;
			line-height: 1.2;
		}

		.disclaimer-box p {
			margin: 12px 0 0;
			font-size: 0.94rem;
		}

		footer {
			padding: 40px 0;
			color: var(--muted);
			border-top: 1px solid rgba(255, 255, 255, 0.08);
		}

		footer .shell {
			display: flex;
			justify-content: space-between;
			gap: 18px;
			flex-wrap: wrap;
		}

		@media (max-width: 900px) {
			.nav-links {
				display: none;
			}

			.hero, .section-head, .pricing, .cta {
				grid-template-columns: 1fr;
			}

			.hero {
				min-height: auto;
				padding-top: 54px;
			}

			.stat-strip, .grid, .metrics, .recipes {
				grid-template-columns: 1fr;
			}
		}

		@media (max-width: 560px) {
			.shell {
				width: min(100% - 24px, 1180px);
			}

			.notice .shell {
				justify-content: flex-start;
				overflow: auto;
			}

			nav .shell {
				gap: 12px;
			}

			nav .actions {
				gap: 8px;
			}

			nav .actions .button {
				min-height: 40px;
				padding: 0 12px;
				font-size: 0.9rem;
			}

			nav .actions .button:first-child {
				display: none;
			}

			h1 {
				font-size: clamp(3rem, 18vw, 4.2rem);
			}

			.hero-card {
				margin-inline: -4px;
			}

			.cta {
				padding: 26px;
			}
		}
	</style>
</head>
<body>
	<div class="notice">
		<div class="shell">
			<span class="pill">Private beta</span>
			<span>Connect once, then ask your health data questions inside any MCP client.</span>
		</div>
	</div>

	<nav>
		<div class="shell">
			<a class="brand" href="/">
				<span class="mark">1H</span>
				<span>OneHealth_MCP</span>
			</a>
			<div class="nav-links" aria-label="Primary navigation">
				<a href="#how">How it works</a>
				<a href="#sources">Sources</a>
				<a href="#prompts">Prompts</a>
				<a href="#pricing">Beta access</a>
				<a href="/settings">Settings</a>
			</div>
			<div class="actions">
				<a class="button" href="/health">Status</a>
				<a class="button" href="/settings">Settings</a>
				<a class="button" href="/connections">Sign in</a>
				<a class="button primary" href="/signup">Sign up</a>
			</div>
		</div>
	</nav>

	<main>
		<section class="shell hero">
			<div>
				<span class="eyebrow">Health data for AI agents</span>
				<h1>Ask your training data anything.</h1>
				<p class="lede">OneHealth_MCP turns workouts, nutrition, endurance, sleep, and recovery signals into one private MCP endpoint for Claude, ChatGPT, Claude Code, and other AI tools.</p>
				<div class="actions">
					<a class="button primary" href="/connections">Connect sources</a>
					<a class="button" href="/settings">Open settings</a>
					<a class="button" href="#how">See how it works</a>
				</div>
				<div class="auth-row" aria-label="Sign in options">
					<a class="button" href="/connections">Continue with GitHub</a>
					${googleHeroButton}
					<p class="auth-note">Use Google or GitHub to create your OneHealth account. You can connect fitness sources after signing in.</p>
				</div>
				<div class="micro">
					<span>No card required</span>
					<span>Encrypted tokens</span>
					<span>Cloudflare hosted</span>
				</div>
			</div>

			<div class="hero-card" aria-label="AI conversation preview">
				<div class="chat-bar">
					<span>claude.ai / chat - OneHealth connected</span>
					<span>MCP</span>
				</div>
				<div class="chat-body">
					<div class="prompt">Why did my run feel harder than usual?</div>
					<span class="tool">Called OneHealth_MCP.query_fitness_context</span>
					<div class="answer">
						Your Strava pace was normal, but average heart rate was up 9 bpm. Yesterday's heavy lower-body session in Hevy and lower sleep duration both point to accumulated fatigue.
						<div class="metrics">
							<div class="metric">Heart rate<strong>+9 bpm</strong></div>
							<div class="metric">Sleep<strong>5h 48m</strong></div>
							<div class="metric">Squat volume<strong>+31%</strong></div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="shell stat-strip" aria-label="Product highlights">
			<div class="stat">
				<strong>1 URL</strong>
				<p>One private <code>/mcp</code> endpoint for every supported client.</p>
			</div>
			<div class="stat">
				<strong>6 sources</strong>
				<p>Hevy, Strava, Cronometer, Intervals.icu, Fitbit, and Google Fit.</p>
			</div>
			<div class="stat">
				<strong>Per-user</strong>
				<p>Each user connects their own tokens. Credentials are encrypted at rest.</p>
			</div>
		</section>

		<section id="how" class="section">
			<div class="shell">
				<div class="section-head">
					<div>
						<span class="eyebrow">How it works</span>
						<h2>Three steps. Then ask anything.</h2>
					</div>
					<p>No new dashboard habit. OneHealth_MCP lives behind the AI tools you already use, and serves your real numbers only when your agent asks.</p>
				</div>
				<div class="grid">
					<div class="card">
						<span class="step-number">Step 01</span>
						<h3>Sign in and connect sources.</h3>
						<p>Use the connections dashboard to add Hevy, Strava, Cronometer, Intervals.icu, Fitbit, or Google Fit credentials.</p>
					</div>
					<div class="card">
						<span class="step-number">Step 02</span>
						<h3>Paste your MCP URL.</h3>
						<p>Connect Claude, ChatGPT, or any MCP-speaking agent to <code>https://onehealth-mcp.senoj90.workers.dev/mcp</code>.</p>
					</div>
					<div class="card">
						<span class="step-number">Step 03</span>
						<h3>Ask useful questions.</h3>
						<p>Your assistant can compare training load, workout history, nutrition, sleep, heart rate, and recovery patterns.</p>
					</div>
				</div>
			</div>
		</section>

		<section id="sources" class="section">
			<div class="shell">
				<div class="section-head">
					<div>
						<span class="eyebrow">Sources</span>
						<h2>Bring your fitness stack.</h2>
					</div>
					<p>Start with the connectors already wired into OneHealth_MCP. Add more services later without changing your MCP client setup.</p>
				</div>
				<div class="sources">
					<div class="source"><strong>Hevy</strong><span class="badge">Live</span></div>
					<div class="source"><strong>Strava</strong><span class="badge">Ready</span></div>
					<div class="source"><strong>Cronometer</strong><span class="badge">Live</span></div>
					<div class="source"><strong>Intervals.icu</strong><span class="badge">Live</span></div>
					<div class="source"><strong>Fitbit</strong><span class="badge">OAuth</span></div>
					<div class="source"><strong>Google Fit</strong><span class="badge">OAuth</span></div>
				</div>
			</div>
		</section>

		<section id="prompts" class="section">
			<div class="shell">
				<div class="section-head">
					<div>
						<span class="eyebrow">Recipes</span>
						<h2>Questions worth asking.</h2>
					</div>
					<p>These are the kinds of prompts OneHealth_MCP is designed to answer once your sources are connected.</p>
				</div>
				<div class="recipes">
					<div class="recipe">Why did my HR spike on easy runs this week?</div>
					<div class="recipe">Which lifts have plateaued over the last 8 weeks?</div>
					<div class="recipe">Compare my training load to sleep quality this month.</div>
					<div class="recipe">What changed before my best workout days?</div>
					<div class="recipe">Summarize my nutrition and workout consistency.</div>
					<div class="recipe">Am I recovering well enough to increase volume?</div>
				</div>
			</div>
		</section>

		<section id="pricing" class="section">
			<div class="shell">
				<div class="section-head">
					<div>
						<span class="eyebrow">Beta access</span>
						<h2>Free while the private beta is small.</h2>
					</div>
					<p>This deployment is set up for a controlled beta. Keep usage modest, connect your own sources, and test the MCP workflow before turning it into a paid product.</p>
				</div>
				<div class="pricing">
					<div class="price-card">
						<h3>Private beta</h3>
						<div class="price">$0</div>
						<p>For your account and a small set of invited testers.</p>
						<ul>
							<li>Google or GitHub sign-in</li>
							<li>Per-user encrypted credentials</li>
							<li>One MCP endpoint</li>
						</ul>
					</div>
					<div class="price-card featured">
						<h3>Product-ready path</h3>
						<div class="price"><span class="strike-price">$19/year</span>$0</div>
						<p>Free for now while the beta stays small. Add Stripe, custom domain, provider review, rate limits, cache, and a polished account dashboard when you are ready to sell.</p>
						<ul>
							<li>Subscription checks before MCP access</li>
							<li>Usage limits and audit logs</li>
							<li>Public OAuth review readiness</li>
						</ul>
					</div>
				</div>
			</div>
		</section>

		<section class="section">
			<div class="shell">
				<div class="cta">
					<div>
						<span class="eyebrow">Start here</span>
						<h2>Connect your sources.</h2>
						<p>Sign in with Google or GitHub, add credentials, then point your MCP client at the live OneHealth endpoint.</p>
					</div>
					<div class="actions">
						<a class="button" href="/connections">Sign up with GitHub</a>
						<a class="button" href="/settings">Open settings</a>
						<a class="button google" href="/signup">Google option</a>
					</div>
				</div>
			</div>
		</section>

		<section class="disclaimer" aria-labelledby="experimental-disclaimer">
			<div class="shell">
				<div class="disclaimer-box">
					<h2 id="experimental-disclaimer">⚗️ Experimental</h2>
					<p>This is an experimental website built to demonstrate AI-powered fitness integrations with Strava and Garmin. It is not a finished product and is provided for demonstration purposes only.</p>
					<p>Features may be incomplete, change without notice, or stop working at any time. AI-generated insights are informational only — not medical, nutritional, or professional training advice. Use at your own risk.</p>
					<p>By using this site you acknowledge it is a work in progress with no warranties of any kind.</p>
				</div>
			</div>
		</section>
	</main>

	<footer>
		<div class="shell">
			<span>OneHealth_MCP</span>
			<span>Private by default. Built for MCP clients.</span>
		</div>
	</footer>
</body>
</html>`;

	return c.html(html);
});

export default utilityRoutes;
