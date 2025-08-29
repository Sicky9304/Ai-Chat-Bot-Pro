// AI Coding Assistant Chat Application
class ChatApp {
    constructor() {
        // Firebase Configuration (Replace with your actual config)
        this.firebaseConfig = {
            apiKey: "YOUR_API_KEY_HERE",
            authDomain: "your-project.firebaseapp.com", 
            projectId: "your-project-id",
            storageBucket: "your-project.appspot.com",
            messagingSenderId: "123456789",
            appId: "1:123456789:web:abcdefghijklmnop"
        };

        // Gemini AI Configuration (Replace with your actual API key)
        this.geminiConfig = {
            apiKey: "YOUR_GEMINI_API_KEY_HERE",
            modelName: "gemini-1.5-flash",
            apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
        };

        // Application state
        this.currentSessionId = null;
        this.messages = [];
        this.isLoading = false;
        
        // DOM elements
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.chatForm = document.getElementById('chatForm');
        this.sendBtn = document.getElementById('sendBtn');
        this.newSessionBtn = document.getElementById('newSessionBtn');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorToast = document.getElementById('errorToast');
        this.errorMessage = document.getElementById('errorMessage');

        this.init();
    }

    async init() {
        try {
            await this.initializeFirebase();
            this.setupEventListeners();
            this.setupTextareaAutoResize();
            await this.loadPreviousSession();
            this.showSuccessMessage('Chat initialized successfully!');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize chat. Please refresh the page.');
            // Even if initialization fails, don't keep loading state
            this.createNewSession();
        }
    }

    async initializeFirebase() {
        try {
            // Initialize Firebase
            this.app = window.firebaseModules.initializeApp(this.firebaseConfig);
            this.db = window.firebaseModules.getFirestore(this.app);
            console.log('Firebase initialized successfully');
        } catch (error) {
            console.error('Firebase initialization error:', error);
            // Don't throw error to prevent app from being unusable
            // Just log the error and continue with local functionality
            console.log('Continuing without Firebase functionality');
        }
    }

    setupEventListeners() {
        // Chat form submission
        this.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // Enter key handling for textarea
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Button event listeners
        this.newSessionBtn.addEventListener('click', () => this.createNewSession());
        this.clearChatBtn.addEventListener('click', () => this.clearChat());

        // Input validation
        this.messageInput.addEventListener('input', () => {
            this.sendBtn.disabled = !this.messageInput.value.trim() || this.isLoading;
        });
    }

    setupTextareaAutoResize() {
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });
    }

    async sendMessage() {
        const messageText = this.messageInput.value.trim();
        if (!messageText || this.isLoading) return;

        try {
            this.setLoading(true);
            
            // Create user message
            const userMessage = {
                id: this.generateId(),
                text: messageText,
                sender: 'user',
                timestamp: new Date()
            };

            // Add user message to UI and state
            this.addMessage(userMessage);
            this.messageInput.value = '';
            this.messageInput.style.height = 'auto';

            // Show typing indicator
            this.showTypingIndicator();

            // Get AI response
            const aiResponse = await this.getAIResponse(messageText);
            
            // Remove typing indicator
            this.hideTypingIndicator();

            // Create AI message
            const aiMessage = {
                id: this.generateId(),
                text: aiResponse,
                sender: 'ai',
                timestamp: new Date()
            };

            // Add AI message to UI and state
            this.addMessage(aiMessage);

            // Save session to Firestore (if available)
            if (this.db) {
                await this.saveSession();
            }

        } catch (error) {
            this.hideTypingIndicator();
            console.error('Error sending message:', error);
            this.showError('Failed to send message. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    async getAIResponse(prompt) {
        try {
            // Enhanced prompt for coding assistant
            const systemPrompt = `You are an expert AI coding assistant. Help users with:
- Programming concepts and best practices
- Code debugging and troubleshooting  
- Algorithm explanations
- Code reviews and optimizations
- Technology recommendations
- Step-by-step coding guidance

Provide clear, practical, and helpful responses. Use code examples when relevant.

User query: ${prompt}`;

            const response = await fetch(`${this.geminiConfig.apiUrl}?key=${this.geminiConfig.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: systemPrompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Invalid response format from AI');
            }
        } catch (error) {
            console.error('AI API Error:', error);
            return "I'm sorry, I'm having trouble connecting to the AI service right now. This is likely because the API key is not configured. Please check your Gemini API configuration and try again.";
        }
    }

    addMessage(message) {
        this.messages.push(message);
        
        // Remove welcome message if it exists
        const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // Create message element
        const messageElement = this.createMessageElement(message);
        this.messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        this.scrollToBottom();
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message--${message.sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = message.sender === 'user' ? '👤' : '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = message.text;

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = this.formatTime(message.timestamp);

        bubble.appendChild(content);
        bubble.appendChild(time);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);

        return messageDiv;
    }

    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message message--ai typing-indicator';
        typingDiv.id = 'typingIndicator';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const dots = document.createElement('div');
        dots.className = 'typing-dots';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            dots.appendChild(dot);
        }

        bubble.appendChild(dots);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(bubble);
        
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    async saveSession() {
        if (!this.db || !this.currentSessionId || this.messages.length === 0) return;

        try {
            const sessionData = {
                sessionId: this.currentSessionId,
                messages: this.messages,
                updatedAt: window.firebaseModules.serverTimestamp(),
                createdAt: window.firebaseModules.serverTimestamp()
            };

            await window.firebaseModules.addDoc(
                window.firebaseModules.collection(this.db, 'sessions'),
                sessionData
            );
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }

    async loadPreviousSession() {
        if (!this.db) {
            this.createNewSession();
            return;
        }

        try {
            const sessionsQuery = window.firebaseModules.query(
                window.firebaseModules.collection(this.db, 'sessions'),
                window.firebaseModules.orderBy('updatedAt', 'desc')
            );
            
            const querySnapshot = await window.firebaseModules.getDocs(sessionsQuery);
            
            if (!querySnapshot.empty) {
                const latestSession = querySnapshot.docs[0].data();
                this.currentSessionId = latestSession.sessionId;
                this.messages = latestSession.messages || [];
                
                // Render messages
                if (this.messages.length > 0) {
                    const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
                    if (welcomeMessage) {
                        welcomeMessage.remove();
                    }
                    
                    this.messages.forEach(message => {
                        const messageElement = this.createMessageElement(message);
                        this.messagesContainer.appendChild(messageElement);
                    });
                    
                    this.scrollToBottom();
                }
            } else {
                this.createNewSession();
            }
        } catch (error) {
            console.error('Error loading previous session:', error);
            this.createNewSession();
        }
    }

    createNewSession() {
        this.currentSessionId = this.generateId();
        this.messages = [];
        this.clearMessages();
        this.showWelcomeMessage();
        this.showSuccessMessage('New chat session started!');
    }

    clearChat() {
        this.clearMessages();
        this.messages = [];
        this.showWelcomeMessage();
        this.showSuccessMessage('Chat cleared successfully!');
    }

    clearMessages() {
        // Remove all messages except welcome message
        const messages = this.messagesContainer.querySelectorAll('.message, .typing-indicator');
        messages.forEach(message => message.remove());
    }

    showWelcomeMessage() {
        if (!this.messagesContainer.querySelector('.welcome-message')) {
            const welcomeHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            <path d="M13 8H7"></path>
                            <path d="M17 12H7"></path>
                        </svg>
                    </div>
                    <h3>Welcome to AI Coding Assistant</h3>
                    <p>Ask me anything about coding, programming concepts, debugging, or software development. I'm here to help!</p>
                </div>
            `;
            this.messagesContainer.innerHTML = welcomeHTML;
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.disabled = loading || !this.messageInput.value.trim();
        this.messageInput.disabled = loading;
        
        // Only show loading overlay during message sending, not during initialization
        if (loading && this.messages.length > 0) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorToast.classList.remove('hidden');
        
        setTimeout(() => {
            this.errorToast.classList.add('hidden');
        }, 5000);
    }

    showSuccessMessage(message) {
        // Create a temporary success toast
        const successToast = document.createElement('div');
        successToast.className = 'error-toast';
        successToast.style.background = 'var(--color-success)';
        successToast.innerHTML = `
            <div class="error-content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22,4 12,14.01 9,11.01"></polyline>
                </svg>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(successToast);
        
        setTimeout(() => {
            successToast.remove();
        }, 3000);
    }

    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }

    formatTime(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Initialize the chat application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase modules to be loaded
    setTimeout(() => {
        if (window.firebaseModules) {
            new ChatApp();
        } else {
            console.error('Firebase modules not loaded');
            // Initialize app anyway with limited functionality
            window.firebaseModules = {
                initializeApp: () => null,
                getFirestore: () => null,
                collection: () => null,
                addDoc: () => Promise.resolve(),
                getDocs: () => Promise.resolve({ empty: true }),
                orderBy: () => null,
                query: () => null,
                serverTimestamp: () => new Date()
            };
            new ChatApp();
        }
    }, 500);
});