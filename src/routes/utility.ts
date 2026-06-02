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
	<title>OneHealth_MCP</title>
	<style>
		:root {
			color-scheme: light dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		}

		body {
			margin: 0;
			color: #172033;
			background: #f6f7f9;
		}

		main {
			max-width: 920px;
			margin: 0 auto;
			padding: 56px 20px;
		}

		.hero {
			padding: 40px 0 32px;
			border-bottom: 1px solid #d8dde8;
		}

		h1 {
			margin: 0 0 12px;
			font-size: clamp(2rem, 6vw, 4rem);
			line-height: 1;
			letter-spacing: 0;
		}

		p {
			max-width: 680px;
			color: #4d5a70;
			font-size: 1.05rem;
			line-height: 1.7;
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 12px;
			margin-top: 28px;
		}

		a {
			color: #1463ff;
		}

		.button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 44px;
			padding: 0 18px;
			border: 1px solid #172033;
			border-radius: 8px;
			background: #172033;
			color: white;
			font-weight: 650;
			text-decoration: none;
		}

		.button.secondary {
			background: transparent;
			color: #172033;
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 16px;
			margin-top: 32px;
		}

		.item {
			padding: 18px;
			border: 1px solid #d8dde8;
			border-radius: 8px;
			background: white;
		}

		h2, h3 {
			margin: 0 0 10px;
			letter-spacing: 0;
		}

		code {
			background: #e9edf5;
			border-radius: 4px;
			padding: 2px 5px;
		}

		@media (prefers-color-scheme: dark) {
			body {
				color: #eef2f8;
				background: #10141d;
			}

			p {
				color: #b4bfd2;
			}

			.hero, .item {
				border-color: #2d3748;
			}

			.item {
				background: #151b27;
			}

			.button {
				background: #eef2f8;
				color: #10141d;
				border-color: #eef2f8;
			}

			.button.secondary {
				background: transparent;
				color: #eef2f8;
			}

			code {
				background: #252f42;
			}
		}
	</style>
</head>
<body>
	<main>
		<section class="hero">
			<h1>OneHealth_MCP</h1>
			<p>A remote Model Context Protocol server for connecting AI assistants to fitness data from Hevy, Strava, Cronometer, and Intervals.icu.</p>
			<div class="actions">
				<a class="button" href="/connections">Manage Connections</a>
				<a class="button secondary" href="/health">Health Check</a>
			</div>
		</section>

		<section class="grid" aria-label="Available integrations">
			<div class="item">
				<h3>Unified Endpoint</h3>
				<p>Connect your MCP client once at <code>/mcp</code> and use all configured fitness tools from one server.</p>
			</div>
			<div class="item">
				<h3>Credential Safety</h3>
				<p>Users connect services in /connections. Credentials are encrypted and stored per user in Cloudflare D1.</p>
			</div>
			<div class="item">
				<h3>Service Status</h3>
				<p>Use <code>fitness_get_connected_services</code> to see which integrations are ready.</p>
			</div>
		</section>
	</main>
</body>
</html>`;

	return c.html(html);
});

export default utilityRoutes;
