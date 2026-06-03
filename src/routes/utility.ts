import { Hono } from "hono";
import type { Env, Variables } from "../app.js";

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

utilityRoutes.get("/", (c) => {
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
			</div>
			<div class="actions">
				<a class="button" href="/health">Status</a>
				<a class="button" href="/connections">Sign in</a>
				<a class="button primary" href="/auth/google?return_to=/connections">Sign up</a>
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
					<a class="button" href="#how">See how it works</a>
				</div>
				<div class="auth-row" aria-label="Sign in options">
					<a class="button google" href="/auth/google?return_to=/connections">Continue with Google</a>
					<a class="button" href="/connections">Continue with GitHub</a>
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
						<a class="button google" href="/auth/google?return_to=/connections">Sign up with Google</a>
						<a class="button" href="/connections">Sign in with GitHub</a>
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
