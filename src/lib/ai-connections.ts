import type { Props } from "../utils.js";
import { decryptApiKey, encryptApiKey } from "./key-storage.js";
import { ensureUser } from "./service-connections.js";

export type AiProviderId =
	| "openai"
	| "claude"
	| "gemini"
	| "nvidia_nim"
	| "openrouter"
	| "groq"
	| "google_ai_studio";

export interface AiConnectionEnv {
	ONEHEALTH_DB: D1Database;
	COOKIE_ENCRYPTION_KEY: string;
}

export interface AiConnectionSummary {
	provider: AiProviderId;
	baseUrl?: string;
	modelName: string;
	enabled: boolean;
	updatedAt: string;
}

export interface AiConnection extends AiConnectionSummary {
	apiKey: string;
}

function idFor(userId: string, provider: AiProviderId): string {
	return `${userId}:ai:${provider}`;
}

export async function upsertAiConnection(
	env: AiConnectionEnv,
	session: Pick<Props, "login" | "name" | "email">,
	args: {
		provider: AiProviderId;
		apiKey: string;
		baseUrl?: string;
		modelName: string;
		enabled?: boolean;
	},
): Promise<void> {
	const userId = await ensureUser(env, session);
	const now = new Date().toISOString();
	const encrypted = await encryptApiKey(args.apiKey, env.COOKIE_ENCRYPTION_KEY);
	await env.ONEHEALTH_DB.prepare(
		`INSERT INTO user_ai_connections
		   (id, user_id, provider, encrypted_api_key, base_url, model_name, enabled, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, provider) DO UPDATE SET
		   encrypted_api_key = excluded.encrypted_api_key,
		   base_url = excluded.base_url,
		   model_name = excluded.model_name,
		   enabled = excluded.enabled,
		   updated_at = excluded.updated_at`,
	)
		.bind(
			idFor(userId, args.provider),
			userId,
			args.provider,
			encrypted,
			args.baseUrl?.trim() || null,
			args.modelName.trim(),
			args.enabled === false ? 0 : 1,
			now,
			now,
		)
		.run();
}

export async function getAiConnection(
	env: AiConnectionEnv,
	session: Pick<Props, "login" | "name" | "email">,
	provider: AiProviderId,
): Promise<AiConnection | null> {
	const userId = await ensureUser(env, session);
	const row = await env.ONEHEALTH_DB.prepare(
		`SELECT provider, encrypted_api_key, base_url, model_name, enabled, updated_at
		 FROM user_ai_connections
		 WHERE user_id = ? AND provider = ?`,
	)
		.bind(userId, provider)
		.first<{
			provider: AiProviderId;
			encrypted_api_key: string;
			base_url: string | null;
			model_name: string;
			enabled: number;
			updated_at: string;
		}>();
	if (!row) return null;
	return {
		provider: row.provider,
		apiKey: await decryptApiKey(row.encrypted_api_key, env.COOKIE_ENCRYPTION_KEY),
		baseUrl: row.base_url ?? undefined,
		modelName: row.model_name,
		enabled: row.enabled === 1,
		updatedAt: row.updated_at,
	};
}

export async function listAiConnectionSummaries(
	env: AiConnectionEnv,
	session: Pick<Props, "login" | "name" | "email">,
): Promise<AiConnectionSummary[]> {
	const userId = await ensureUser(env, session);
	const { results } = await env.ONEHEALTH_DB.prepare(
		`SELECT provider, base_url, model_name, enabled, updated_at
		 FROM user_ai_connections
		 WHERE user_id = ?
		 ORDER BY provider ASC`,
	)
		.bind(userId)
		.all<{
			provider: AiProviderId;
			base_url: string | null;
			model_name: string;
			enabled: number;
			updated_at: string;
		}>();
	return (results ?? []).map((row) => ({
		provider: row.provider,
		baseUrl: row.base_url ?? undefined,
		modelName: row.model_name,
		enabled: row.enabled === 1,
		updatedAt: row.updated_at,
	}));
}

export async function deleteAiConnection(
	env: AiConnectionEnv,
	session: Pick<Props, "login" | "name" | "email">,
	provider: AiProviderId,
): Promise<void> {
	const userId = await ensureUser(env, session);
	await env.ONEHEALTH_DB.prepare(
		"DELETE FROM user_ai_connections WHERE user_id = ? AND provider = ?",
	)
		.bind(userId, provider)
		.run();
}
