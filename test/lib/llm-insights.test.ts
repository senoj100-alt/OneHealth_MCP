import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiConnection } from "../../src/lib/ai-connections.js";
import { generateNutritionInsight } from "../../src/lib/llm-insights.js";

const INPUT = {
	date: "2026-06-03",
	mode: "today_so_far" as const,
	nutrition: { protein: 80 },
};

function connection(overrides: Partial<AiConnection> = {}): AiConnection {
	return {
		provider: "groq",
		apiKey: "test-key",
		modelName: "openai/gpt-oss-120b",
		requestSettings: {},
		enabled: true,
		updatedAt: "2026-06-03T00:00:00.000Z",
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("LLM nutrition insights", () => {
	it("uses Groq GPT-OSS reasoning-safe request defaults", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				new Response(
					JSON.stringify({
						choices: [{ message: { content: "Useful insight" } }],
					}),
					{ status: 200 },
				),
			);

		await generateNutritionInsight(connection(), INPUT);

		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({
			model: "openai/gpt-oss-120b",
			include_reasoning: false,
			max_completion_tokens: 1200,
		});
		expect(body.max_tokens).toBeUndefined();
	});

	it("accepts OpenAI-compatible array content", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: { content: [{ type: "text", text: "Array response" }] },
						},
					],
				}),
				{ status: 200 },
			),
		);

		await expect(generateNutritionInsight(connection(), INPUT)).resolves.toBe(
			"Array response",
		);
	});

	it("returns actionable guidance when Groq has no final answer", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({ choices: [{ message: { content: "" } }] }),
				{ status: 200 },
			),
		);

		await expect(generateNutritionInsight(connection(), INPUT)).rejects.toThrow(
			"Increase max_completion_tokens or disable reasoning",
		);
	});
});
