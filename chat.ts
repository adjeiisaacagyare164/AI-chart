import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface Message {
    role: 'user' | 'ai';
    content: string;
    timestamp: Date;
    isError?: boolean;
}

interface GeminiPart      { text: string; }
interface GeminiContent   { role: string; parts: GeminiPart[]; }

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [FormsModule, CommonModule],
    templateUrl: './chat.html',
    styleUrl: './chat.css'
})
export class Chat implements OnInit, AfterViewChecked {

    // ── ViewChild refs ────────────────────────────────────────────────────
    @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLElement>;
    @ViewChild('messagesEnd')       private messagesEnd!:       ElementRef<HTMLElement>;

    // ── Public state (template-bound) ─────────────────────────────────────
    messages:      Message[] = [];
    userMessage  = '';
    isTyping     = false;
    isLoading    = false;
    confirmClear = false;
    showApiModal = false;
    pendingApiKey = '';
    charCount    = 0;
    maxChars     = 4000;

    suggestions = [
        'Explain quantum physics simply',
        'Help me write a Python script',
        'What is machine learning?',
        'Teach me calculus basics',
        'Summarize the French Revolution',
        'How does the internet work?',
    ];

    // ── Private state ─────────────────────────────────────────────────────
    private apiKey  = '';
    private history: GeminiContent[] = [];
    private shouldScroll = false;

    private readonly GEMINI_URL =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    private readonly SYSTEM_PROMPT = `You are AI Tutor — a brilliant, patient, and encouraging learning assistant.
Help students understand any topic clearly and deeply.
- Use clear, structured explanations with analogies and real-world examples
- Format responses with Markdown (headings, bullet points, code blocks)
- Be concise but complete; avoid padding
- Encourage curiosity and critical thinking`;

    // ── Lifecycle ─────────────────────────────────────────────────────────
    ngOnInit(): void {
        this.apiKey = localStorage.getItem('gemini_api_key') ?? '';
        if (!this.apiKey) {
            this.showApiModal = true;
        }
    }

    ngAfterViewChecked(): void {
        if (this.shouldScroll) {
            this.scrollToBottom();
            this.shouldScroll = false;
        }
    }

    // ── API Key ───────────────────────────────────────────────────────────
    openApiModal(): void {
        this.pendingApiKey = this.apiKey;
        this.showApiModal  = true;
    }

    saveApiKey(): void {
        const key = this.pendingApiKey.trim();
        if (!key) return;
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
        this.showApiModal = false;
    }

    // ── Input ─────────────────────────────────────────────────────────────
    onInputChange(): void {
        this.charCount = this.userMessage.length;
    }

    useSuggestion(text: string): void {
        this.userMessage = text;
        this.onInputChange();
    }

    // ── Send ──────────────────────────────────────────────────────────────
    async sendMessage(): Promise<void> {
        const text = this.userMessage.trim();
        if (!text || this.isLoading) return;

        if (!this.apiKey) {
            this.openApiModal();
            return;
        }

        // Append user message
        this.messages.push({ role: 'user', content: text, timestamp: new Date() });
        this.history.push({ role: 'user', parts: [{ text }] });
        this.userMessage  = '';
        this.charCount    = 0;
        this.isLoading    = true;
        this.isTyping     = true;
        this.shouldScroll = true;

        try {
            const reply = await this.callGemini();
            this.history.push({ role: 'model', parts: [{ text: reply }] });
            this.messages.push({ role: 'ai', content: reply, timestamp: new Date() });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An error occurred. Please try again.';
            this.messages.push({ role: 'ai', content: msg, timestamp: new Date(), isError: true });
        } finally {
            this.isTyping     = false;
            this.isLoading    = false;
            this.shouldScroll = true;
        }
    }

    // ── Clear ─────────────────────────────────────────────────────────────
    clearChat(): void {
        this.messages     = [];
        this.history      = [];
        this.confirmClear = false;
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    formatTime(date: Date): string {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ── Private ───────────────────────────────────────────────────────────
    private async callGemini(): Promise<string> {
        const body = {
            system_instruction: { parts: [{ text: this.SYSTEM_PROMPT }] },
            contents: this.history,
            generationConfig: {
                temperature:      0.72,
                topP:             0.95,
                maxOutputTokens:  1024,
            },
        };

        const resp = await fetch(`${this.GEMINI_URL}?key=${this.apiKey}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({})) as { error?: { message?: string } };
            const msg = errData?.error?.message ?? `HTTP ${resp.status}`;
            if (msg.toLowerCase().includes('api_key_invalid') || resp.status === 403 || resp.status === 400) {
                throw new Error('Invalid API key. Click ⚙️ to update it.');
            }
            throw new Error(msg);
        }

        const data = await resp.json() as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        return data?.candidates?.[0]?.content?.parts?.[0]?.text
            ?? "I couldn't generate a response — please try again.";
    }

    private scrollToBottom(): void {
        try {
            this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch { /* ignore */ }
    }
}