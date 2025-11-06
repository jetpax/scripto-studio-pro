/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * AI Bridge - API abstraction layer for AI code generation
 * Supports OpenAI, Anthropic, Grok (x.ai), OpenRouter, and custom endpoints
 */

export interface AISettings {
	provider: string;
	apiKey: string;
	model: string;
	endpoint?: string;
	systemPrompt?: string;
}

export interface AIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface AIGenerateResult {
	content: string;
	code: string | null;
}

export class AIBridge {
	private readonly defaultSystemPrompt = `You are an expert MicroPython developer specializing in ESP32 microcontrollers.

Your task is to generate complete, working ScriptO code based on user requests.

IMPORTANT: ScriptO Format Requirements:
1. Include a configuration dictionary between these exact markers:
   # === START_CONFIG_PARAMETERS ===
   dict(
     info = dict(
       name = 'Script Name',
       version = [1, 0, 0],
       category = 'Hardware',
       description = 'Brief description',
       author = 'Your Name'
     ),
     args = dict(
       argName = dict(
         label = 'User-friendly label:',
         type = int,  # str, int, float, bool, list (for GPIO pins), or dict (for dropdowns)
         value = 10,  # default value
         optional = False
       )
     )
   )
   # === END_CONFIG_PARAMETERS ===

2. After the config, write the actual code that uses: args.argName

3. Type options:
   - int: Integer input
   - float: Decimal number input
   - str: Text input
   - bool: Checkbox
   - list: GPIO pin selector (shows pins: 0-48)
   - dict: Dropdown menu (use items = {'key': 'Label', ...})

4. For dict type with dropdown, include 'items':
   items = { '0': 'Option 1', '1': 'Option 2' }

5. Common ESP32 hardware patterns:
   - GPIO: Use machine.Pin(args.pin, machine.Pin.OUT)
   - ADC: Use machine.ADC(machine.Pin(args.pin))
   - PWM: Use machine.PWM(machine.Pin(args.pin), freq=args.frequency)
   - NeoPixel: from neopixel import NeoPixel; np = NeoPixel(Pin(args.pin), args.count)
   - I2C: machine.I2C(0, scl=Pin(args.scl), sda=Pin(args.sda))
   - SPI: machine.SPI(1, baudrate=args.baudrate, sck=Pin(args.sck), mosi=Pin(args.mosi), miso=Pin(args.miso))

6. Always include proper error handling and interrupt support (try/except KeyboardInterrupt)

7. Add helpful comments explaining what the code does

Generate ONLY the Python code with the config dict. Do not include explanations outside the code block.`;

	/**
	 * Test API connection with a simple request
	 */
	async testConnection(settings: AISettings): Promise<void> {
		if (!settings.apiKey) {
			throw new Error('API key is required');
		}

		try {
			const messages: AIMessage[] = [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: 'Say "OK" if you can read this.' }
			];

			await this.makeRequest(messages, settings, true);
		} catch (error: any) {
			throw new Error(error.message || 'Connection test failed');
		}
	}

	/**
	 * Generate code from user prompt
	 */
	async generateCode(
		userMessage: string,
		conversationHistory: AIMessage[],
		settings: AISettings
	): Promise<AIGenerateResult> {
		const messages = this.buildMessages(userMessage, conversationHistory, settings);

		try {
			const response = await this.makeRequest(messages, settings, false);

			// Extract code from response
			const code = this.extractCode(response);

			return {
				content: response,
				code: code
			};
		} catch (error: any) {
			console.error('[AIBridge] Error generating code:', error);
			throw error;
		}
	}

	/**
	 * Build message array for API request
	 */
	private buildMessages(
		userMessage: string,
		conversationHistory: AIMessage[],
		settings: AISettings
	): AIMessage[] {
		const messages: AIMessage[] = [];

		// Add system prompt (use default if empty or not provided)
		const systemPrompt = (settings.systemPrompt && settings.systemPrompt.trim()) 
			? settings.systemPrompt 
			: this.defaultSystemPrompt;

		// For OpenAI, Grok, OpenRouter, and custom endpoints
		if (
			settings.provider === 'openai' ||
			settings.provider === 'grok' ||
			settings.provider === 'openrouter' ||
			settings.provider === 'custom'
		) {
			messages.push({
				role: 'system',
				content: systemPrompt
			});
		}

		// Add conversation history (last 10 messages to stay within token limits)
		const recentHistory = conversationHistory
			.slice(-10)
			.filter((msg) => msg.role === 'user' || msg.role === 'assistant');

		recentHistory.forEach((msg) => {
			if (msg.role === 'user' || msg.role === 'assistant') {
				messages.push({
					role: msg.role,
					content: msg.content
				});
			}
		});

		// Add current user message if not already in history
		const lastMessage = conversationHistory[conversationHistory.length - 1];
		if (!lastMessage || lastMessage.content !== userMessage) {
			messages.push({
				role: 'user',
				content: userMessage
			});
		}

		return messages;
	}

	/**
	 * Make API request to selected provider
	 */
	private async makeRequest(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean = false
	): Promise<string> {
		switch (settings.provider) {
			case 'openai':
				return await this.callOpenAI(messages, settings, isTest);
			case 'anthropic':
				return await this.callAnthropic(messages, settings, isTest);
			case 'grok':
				return await this.callGrok(messages, settings, isTest);
			case 'openrouter':
				return await this.callOpenRouter(messages, settings, isTest);
			case 'custom':
				return await this.callCustomEndpoint(messages, settings, isTest);
			default:
				throw new Error(`Unknown provider: ${settings.provider}`);
		}
	}

	/**
	 * Call OpenAI API
	 */
	private async callOpenAI(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean
	): Promise<string> {
		const url = 'https://api.openai.com/v1/chat/completions';

		const body = {
			model: settings.model,
			messages: isTest
				? [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: 'Say "OK" if you can read this.' }
				  ]
				: messages,
			temperature: 0.7,
			max_tokens: isTest ? 10 : 2000
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			let errorMessage = `OpenAI API error: ${response.status}`;
			try {
				const error = await response.json();
				const errorMsg = error.error?.message || '';

				if (errorMsg.includes('insufficient_quota') || errorMsg.includes('billing')) {
					errorMessage =
						'Insufficient credits or billing issue. Please check your OpenAI account balance.';
				} else if (response.status === 401) {
					errorMessage =
						'Invalid API key. Please check your API key in System > AI Agent settings.';
				} else if (response.status === 403) {
					errorMessage =
						'Access forbidden. Check your API key permissions and account status.';
				} else {
					errorMessage = error.error?.message || errorMessage;
				}
			} catch (e) {
				errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
			}
			throw new Error(errorMessage);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	/**
	 * Call Anthropic API
	 */
	private async callAnthropic(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean
	): Promise<string> {
		const url = 'https://api.anthropic.com/v1/messages';

		// Anthropic separates system prompt from messages
		const systemPrompt =
			messages.find((m) => m.role === 'system')?.content ||
			settings.systemPrompt ||
			this.defaultSystemPrompt;
		const userMessages = messages.filter((m) => m.role !== 'system');

		const body = {
			model: settings.model,
			max_tokens: isTest ? 10 : 2000,
			system: isTest ? 'You are a helpful assistant.' : systemPrompt,
			messages: isTest
				? [{ role: 'user', content: 'Say "OK" if you can read this.' }]
				: userMessages
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': settings.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				let errorMessage = `Anthropic API error: ${response.status}`;
				try {
					const error = await response.json();
					errorMessage = error.error?.message || error.message || errorMessage;
				} catch (e) {
					// Response might not be JSON
				}
				throw new Error(errorMessage);
			}

			const data = await response.json();
			return data.content[0].text;
		} catch (error: any) {
			// Check for CORS errors
			if (
				error.message.includes('CORS') ||
				error.message.includes('Access-Control-Allow-Origin') ||
				(error.name === 'TypeError' && error.message.includes('Failed to fetch'))
			) {
				throw new Error(
					'Anthropic API does not support direct browser access due to CORS restrictions. Please use OpenAI, Grok, or OpenRouter instead, or set up a server-side proxy for Anthropic.'
				);
			}
			throw error;
		}
	}

	/**
	 * Call Grok (x.ai) API
	 */
	private async callGrok(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean
	): Promise<string> {
		const url = 'https://api.x.ai/v1/chat/completions';

		const body = {
			model: settings.model,
			messages: isTest
				? [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: 'Say "OK" if you can read this.' }
				  ]
				: messages,
			stream: false,
			temperature: isTest ? 0 : 0.7,
			max_tokens: isTest ? 10 : 2000
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			let errorMessage = `Grok API error: ${response.status} ${response.statusText}`;
			try {
				const error = await response.json();

				// Check for specific error codes and provide helpful messages
				if (error.code || error.error) {
					const code = error.code || '';
					const errorMsg = error.error || '';

					if (code.includes('permission') || errorMsg.includes('credits')) {
						errorMessage =
							'No credits available. Please purchase credits at https://console.x.ai or check your account balance.';
					} else if (code.includes('authentication') || response.status === 401) {
						errorMessage =
							'Invalid API key. Please check your API key in System > AI Agent settings.';
					} else if (response.status === 403) {
						errorMessage =
							error.error ||
							error.message ||
							'Access forbidden. Check your API key permissions and account status.';
					} else {
						errorMessage = error.error || error.message || error.code || errorMessage;
					}
				} else {
					errorMessage = error.message || errorMessage;
				}
			} catch (e) {
				// If response isn't JSON, use status text
				const text = await response.text();
				if (text) {
					errorMessage += ` - ${text}`;
				}
			}
			throw new Error(errorMessage);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	/**
	 * Call OpenRouter API
	 */
	private async callOpenRouter(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean
	): Promise<string> {
		const url = 'https://openrouter.ai/api/v1/chat/completions';

		const body = {
			model: settings.model,
			messages: isTest
				? [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: 'Say "OK" if you can read this.' }
				  ]
				: messages
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`,
				'HTTP-Referer': 'https://github.com/yourusername/scripto-studio-pro',
				'X-Title': 'ScriptO Studio Pro'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
			try {
				const error = await response.json();
				const errorMsg = error.error?.message || error.message || '';

				if (errorMsg.includes('credits') || errorMsg.includes('balance')) {
					errorMessage = 'Insufficient credits. Please add credits to your OpenRouter account.';
				} else if (response.status === 401) {
					errorMessage =
						'Invalid API key. Please check your API key in System > AI Agent settings.';
				} else if (response.status === 403) {
					errorMessage =
						error.error?.message ||
						error.message ||
						'Access forbidden. Check your API key permissions and account status.';
				} else {
					errorMessage = error.error?.message || error.message || errorMessage;
				}
			} catch (e) {
				// If response isn't JSON, use status text
				const text = await response.text();
				if (text) {
					errorMessage += ` - ${text}`;
				}
			}
			throw new Error(errorMessage);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	/**
	 * Call custom endpoint
	 */
	private async callCustomEndpoint(
		messages: AIMessage[],
		settings: AISettings,
		isTest: boolean
	): Promise<string> {
		if (!settings.endpoint) {
			throw new Error('Custom endpoint URL is required');
		}

		const body = {
			model: settings.model,
			messages: isTest
				? [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: 'Say "OK" if you can read this.' }
				  ]
				: messages,
			temperature: 0.7,
			max_tokens: isTest ? 10 : 2000
		};

		const response = await fetch(settings.endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiKey}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			throw new Error(`Custom endpoint error: ${response.status}`);
		}

		const data = await response.json();

		// Try to extract content from common response formats
		if (data.choices && data.choices[0]?.message?.content) {
			return data.choices[0].message.content;
		} else if (data.content && Array.isArray(data.content)) {
			return data.content[0].text;
		} else if (data.response) {
			return data.response;
		} else if (data.text) {
			return data.text;
		}

		throw new Error('Unable to parse response from custom endpoint');
	}

	/**
	 * Extract Python code from markdown response
	 */
	private extractCode(response: string): string | null {
		// Look for ```python code blocks
		const pythonMatch = response.match(/```python\n([\s\S]*?)```/);
		if (pythonMatch) {
			return pythonMatch[1].trim();
		}

		// Look for generic ``` code blocks
		const codeMatch = response.match(/```\n([\s\S]*?)```/);
		if (codeMatch) {
			return codeMatch[1].trim();
		}

		// If no code block found, check if the entire response looks like Python code
		if (response.includes('# === START_CONFIG_PARAMETERS ===')) {
			return response.trim();
		}

		// No code found
		return null;
	}
}

