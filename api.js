import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

export class ApiClient {
	constructor() {
		this._session = new Soup.Session();
	}

	async sendMessage(provider, apiKey, model, messages) {
		if (!apiKey) {
			throw new Error("API Key is missing");
		}

		if (provider === "openai") {
			return this._sendOpenAI(apiKey, model, messages);
		} else if (provider === "gemini") {
			return this._sendGemini(apiKey, model, messages);
		} else {
			throw new Error("Invalid provider");
		}
	}

	async _sendOpenAI(apiKey, model, messages) {
		const url = "https://api.openai.com/v1/chat/completions";
		const body = JSON.stringify({
			model: model || "gpt-4o-mini",
			messages: messages,
		});

		const message = Soup.Message.new("POST", url);
		message.request_headers.append("Authorization", `Bearer ${apiKey}`);
		message.request_headers.append("Content-Type", "application/json");

		const encoder = new TextEncoder();
		const bytes = GLib.Bytes.new(encoder.encode(body));
		message.set_request_body_from_bytes("application/json", bytes);

		const responseBytes = await this._session.send_and_read_async(
			message,
			GLib.PRIORITY_DEFAULT,
			null,
		);

		const decoder = new TextDecoder("utf-8");
		const responseText = decoder.decode(responseBytes.get_data());

		if (message.status_code !== 200) {
			throw new Error(`OpenAI Error: ${message.status_code} - ${responseText}`);
		}

		const json = JSON.parse(responseText);
		return json.choices[0].message.content;
	}

	async _sendGemini(apiKey, model, messages) {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${apiKey}`;

		const systemMessage = messages.find(m => m.role === "system");
		const chatMessages = messages.filter(m => m.role !== "system");

		const body = {
			contents: chatMessages.map(m => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{text: m.content}],
			})),
		};

		if (systemMessage) {
			body.system_instruction = {
				parts: [{text: systemMessage.content}],
			};
		}

		const message = Soup.Message.new("POST", url);
		message.request_headers.append("Content-Type", "application/json");

		const encoder = new TextEncoder();
		const bytes = GLib.Bytes.new(encoder.encode(JSON.stringify(body)));
		message.set_request_body_from_bytes("application/json", bytes);

		const responseBytes = await this._session.send_and_read_async(
			message,
			GLib.PRIORITY_DEFAULT,
			null,
		);
		const decoder = new TextDecoder("utf-8");
		const responseText = decoder.decode(responseBytes.get_data());

		if (message.status_code !== 200) {
			throw new Error(`Gemini Error: ${message.status_code} - ${responseText}`);
		}

		const json = JSON.parse(responseText);
		if (
			json.candidates &&
			json.candidates[0].content &&
			json.candidates[0].content.parts[0]
		) {
			return json.candidates[0].content.parts[0].text;
		} else {
			throw new Error("Unexpected Gemini response format");
		}
	}
}
