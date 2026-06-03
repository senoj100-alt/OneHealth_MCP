import type { Env } from "../app.js";
import { getAiConnection, listAiConnectionSummaries } from "./ai-connections.js";
import { CronometerClient, KvCronometerSessionCache } from "./cronometer-client.js";
import { generateBasicNutritionInsight, generateNutritionInsight } from "./llm-insights.js";
import {
	type DueNotificationSchedule,
	getTelegramConnection,
	listDueNutritionSchedules,
	logNotification,
	markNotificationSlotSent,
} from "./notifications.js";
import { getServiceConnection } from "./service-connections.js";
import { escapeTelegramHtml, sendTelegramMessage } from "./telegram.js";

function sessionForDueSchedule(schedule: DueNotificationSchedule) {
	return {
		login: schedule.login,
		name: schedule.name,
		email: schedule.email,
		accessToken: "",
	};
}

function dateForInsight(schedule: DueNotificationSchedule): string {
	if (schedule.insightMode === "previous_day") {
		const date = new Date(`${schedule.localDate}T00:00:00Z`);
		date.setUTCDate(date.getUTCDate() - 1);
		return date.toISOString().slice(0, 10);
	}
	if (schedule.insightMode === "smart" && schedule.dueTime < "08:00") {
		const date = new Date(`${schedule.localDate}T00:00:00Z`);
		date.setUTCDate(date.getUTCDate() - 1);
		return date.toISOString().slice(0, 10);
	}
	return schedule.localDate;
}

async function getCronometerNutrition(env: Env, schedule: DueNotificationSchedule, date: string): Promise<unknown> {
	const session = sessionForDueSchedule(schedule);
	const connection = await getServiceConnection<Record<string, string>>(env, session, "cronometer");
	const username = connection?.credentials.username || env.CRONOMETER_USERNAME;
	const password = connection?.credentials.password || env.CRONOMETER_PASSWORD;
	const client = new CronometerClient({
		username,
		password,
		timezone: schedule.timezone,
		sessionCache: new KvCronometerSessionCache(env.OAUTH_KV),
	});
	return client.getDailyNutrition(date);
}

async function getPreferredAiConnection(env: Env, schedule: DueNotificationSchedule) {
	const session = sessionForDueSchedule(schedule);
	const summaries = await listAiConnectionSummaries(env, session);
	const preferred = summaries.find((summary) => summary.enabled) ?? summaries[0];
	if (!preferred) return null;
	return getAiConnection(env, session, preferred.provider);
}

async function processDueSchedule(env: Env, schedule: DueNotificationSchedule): Promise<void> {
	const session = sessionForDueSchedule(schedule);
	const telegram = await getTelegramConnection(env, session);
	if (!telegram?.externalUserId || !telegram.enabled) {
		await logNotification(env, {
			userId: schedule.userId,
			channel: "telegram",
			topic: "nutrition",
			scheduledFor: schedule.slotKey,
			status: "skipped",
			errorMessage: "Telegram is not connected.",
		});
		await markNotificationSlotSent(env, schedule.userId, schedule.slotKey);
		return;
	}

	const date = dateForInsight(schedule);
	const nutrition = await getCronometerNutrition(env, schedule, date);
	const aiConnection = await getPreferredAiConnection(env, schedule);
	const insight = aiConnection
		? await generateNutritionInsight(aiConnection, {
				date,
				mode: schedule.insightMode,
				nutrition,
			})
		: generateBasicNutritionInsight({
				date,
				mode: schedule.insightMode,
				nutrition,
			});
	const title = schedule.insightMode === "previous_day" || date < schedule.localDate
		? "OneHealth previous day nutrition"
		: "OneHealth nutrition check-in";
	await sendTelegramMessage(env, {
		chatId: telegram.externalUserId,
		text: `<b>${escapeTelegramHtml(title)}</b>\n\n${escapeTelegramHtml(insight)}`,
	});
	await markNotificationSlotSent(env, schedule.userId, schedule.slotKey);
	await logNotification(env, {
		userId: schedule.userId,
		channel: "telegram",
		topic: "nutrition",
		scheduledFor: schedule.slotKey,
		status: "sent",
	});
}

export async function processNutritionNotifications(env: Env, now = new Date()): Promise<{ processed: number; failed: number }> {
	const due = await listDueNutritionSchedules(env, now);
	let processed = 0;
	let failed = 0;
	for (const schedule of due) {
		try {
			await processDueSchedule(env, schedule);
			processed += 1;
		} catch (error) {
			failed += 1;
			await logNotification(env, {
				userId: schedule.userId,
				channel: "telegram",
				topic: "nutrition",
				scheduledFor: schedule.slotKey,
				status: "failed",
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return { processed, failed };
}
