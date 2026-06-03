export interface TelegramEnv {
	TELEGRAM_BOT_TOKEN?: string;
}

export interface TelegramMessage {
	chatId: string;
	text: string;
}

export async function sendTelegramMessage(
	env: TelegramEnv,
	message: TelegramMessage,
): Promise<void> {
	if (!env.TELEGRAM_BOT_TOKEN) {
		throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
	}
	const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: message.chatId,
			text: message.text,
			parse_mode: "HTML",
			disable_web_page_preview: true,
		}),
	});
	if (!response.ok) {
		throw new Error(`Telegram send failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
	}
}

export function escapeTelegramHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
