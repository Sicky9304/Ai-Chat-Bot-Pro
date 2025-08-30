import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './App.css';

// Firebase Configuration - Replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyDC6Au-QwvsBrIYkATqTl1a1rX-w6t3ozw",
  authDomain: "ai-chat-boat-2440a.firebaseapp.com",
  projectId: "ai-chat-boat-2440a",
  storageBucket: "ai-chat-boat-2440a.firebasestorage.app",
  messagingSenderId: "76899110532",
  appId: "1:76899110532:web:d2fafbc4e1f246207cbcd1",
  measurementId: "G-LM97GJS6PV"
};

// Gemini AI Configuration - Replace with your actual API key
const GEMINI_API_KEY = "AIzaSyBS4q_gN8VGsWR59yX4cdTxWVbKwQTDXDE";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [showSessionList, setShowSessionList] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize dark mode based on system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(mediaQuery.matches);

    // Listen for system theme changes
    const handleThemeChange = (e) => {
      setIsDarkMode(e.matches);
    };

    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  // Apply dark mode class to body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  // Load all sessions on app start
  useEffect(() => {
    loadAllSessions();
  }, []);

  // Generate unique session ID
  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Format AI response text with proper formatting
  const formatAIResponse = (text) => {
    // Convert markdown-like formatting to HTML
    let formattedText = text
      // Convert headers
      .replace(/^### (.*$)/gm, '<h3 class="ai-header-3">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="ai-header-2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="ai-header-1">$1</h1>')

      // Convert bullet points
      .replace(/^\* (.*$)/gm, '<li class="ai-bullet">$1</li>')
      .replace(/^- (.*$)/gm, '<li class="ai-bullet">$1</li>')

      // Convert numbered lists
      .replace(/^\d+\. (.*$)/gm, '<li class="ai-numbered">$1</li>')

      // Convert bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="ai-bold">$1</strong>')
      .replace(/__(.*?)__/g, '<strong class="ai-bold">$1</strong>')

      // Convert italic text
      .replace(/\*(.*?)\*/g, '<em class="ai-italic">$1</em>')
      .replace(/_(.*?)_/g, '<em class="ai-italic">$1</em>')

      // Convert inline code
      .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')

      // Convert code blocks
      .replace(/```([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$1</code></pre>')

      // Convert line breaks
      .replace(/\n/g, '<br/>');

    // Wrap consecutive list items in ul/ol tags
    formattedText = formattedText
      .replace(/(<li class="ai-bullet">.*?<\/li>)/gs, (match) => {
        const items = match.match(/<li class="ai-bullet">.*?<\/li>/g);
        return `<ul class="ai-bullet-list">${items.join('')}</ul>`;
      })
      .replace(/(<li class="ai-numbered">.*?<\/li>)/gs, (match) => {
        const items = match.match(/<li class="ai-numbered">.*?<\/li>/g);
        return `<ol class="ai-numbered-list">${items.join('')}</ol>`;
      });

    return formattedText;
  };

  // Load all sessions from Firestore
  const loadAllSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const sessionsQuery = query(
        collection(db, 'sessions'),
        orderBy('createdAt', 'desc')
      );
      const sessionSnapshot = await getDocs(sessionsQuery);

      const sessionsList = [];
      sessionSnapshot.forEach((doc) => {
        const sessionData = doc.data();
        sessionsList.push({
          id: doc.id,
          ...sessionData,
          title: generateSessionTitle(sessionData.messages)
        });
      });

      setSessions(sessionsList);

      // Load the most recent session if available
      if (sessionsList.length > 0) {
        await loadSession(sessionsList[0].id);
      } else {
        // Create first session if no sessions exist
        await createNewSession();
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      setError('Failed to load sessions');
      await createNewSession();
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Generate session title from first message or timestamp
  const generateSessionTitle = (messages) => {
    if (messages && messages.length > 0) {
      const firstUserMessage = messages.find(msg => msg.sender === 'user');
      if (firstUserMessage) {
        return firstUserMessage.text.substring(0, 30) + (firstUserMessage.text.length > 30 ? '...' : '');
      }
    }
    return `Chat ${new Date().toLocaleDateString()}`;
  };

  // Load a specific session
  const loadSession = async (sessionId) => {
    try {
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        setCurrentSessionId(sessionId);
        setMessages(sessionData.messages || []);
        setUploadedFiles(sessionData.files || []);
        setError('');
      }
    } catch (error) {
      console.error('Error loading session:', error);
      setError('Failed to load session');
    }
  };

  // Create a new chat session
  const createNewSession = async () => {
    try {
      const sessionId = generateSessionId();
      const newSessionDoc = await addDoc(collection(db, 'sessions'), {
        sessionId,
        createdAt: serverTimestamp(),
        messages: [],
        files: []
      });

      const newSession = {
        id: newSessionDoc.id,
        sessionId,
        createdAt: new Date(),
        messages: [],
        files: [],
        title: `New Chat ${new Date().toLocaleDateString()}`
      };

      // Add to sessions list at the beginning
      setSessions(prevSessions => [newSession, ...prevSessions]);

      setCurrentSessionId(newSessionDoc.id);
      setMessages([]);
      setUploadedFiles([]);
      setError('');
      setShowSessionList(false);
    } catch (error) {
      console.error('Error creating new session:', error);
      setError('Failed to create new session');
    }
  };

  // Save messages and files to Firestore
  const saveToFirestore = async (updatedMessages, updatedFiles = uploadedFiles) => {
    if (!currentSessionId) return;

    try {
      const sessionRef = doc(db, 'sessions', currentSessionId);
      await updateDoc(sessionRef, {
        messages: updatedMessages,
        files: updatedFiles,
        updatedAt: serverTimestamp()
      });

      // Update session title in local state
      setSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === currentSessionId
            ? { ...session, title: generateSessionTitle(updatedMessages), messages: updatedMessages, files: updatedFiles }
            : session
        )
      );
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      setError('Failed to save chat history');
    }
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsProcessingFile(true);
    setError('');

    try {
      const processedFiles = [];

      for (const file of files) {
        // Check file size (limit to 10MB)
        if (file.size > 10 * 1024 * 1024) {
          setError(`File ${file.name} is too large. Maximum size is 10MB.`);
          continue;
        }

        // Check file type
        const allowedTypes = [
          'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/css', 'text/javascript',
          'application/json', 'application/xml', 'application/pdf',
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        const fileExtension = file.name.split('.').pop().toLowerCase();
        const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift', 'kt'];

        if (!allowedTypes.includes(file.type) && !codeExtensions.includes(fileExtension)) {
          setError(`File type ${file.type || fileExtension} is not supported.`);
          continue;
        }

        let fileContent = '';
        let fileType = 'text';

        // Handle different file types
        if (file.type.startsWith('image/')) {
          fileType = 'image';
          // For images, we'll store base64 but in a real app you'd upload to storage
          const base64 = await fileToBase64(file);
          fileContent = base64;
        } else if (file.type === 'application/pdf') {
          fileType = 'pdf';
          fileContent = 'PDF content extraction would require additional library like PDF.js';
        } else {
          // Text-based files
          fileContent = await file.text();
        }

        const processedFile = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: fileType,
          size: file.size,
          content: fileContent,
          uploadedAt: new Date().toISOString()
        };

        processedFiles.push(processedFile);
      }

      const updatedFiles = [...uploadedFiles, ...processedFiles];
      setUploadedFiles(updatedFiles);
      await saveToFirestore(messages, updatedFiles);

      if (processedFiles.length > 0) {
        const fileNames = processedFiles.map(f => f.name).join(', ');
        setInputMessage(prev => prev + `\n\n[Files uploaded: ${fileNames}]\nCan you help me analyze these files?`);
      }

    } catch (error) {
      console.error('Error processing files:', error);
      setError(`Failed to process files: ${error.message}`);
    } finally {
      setIsProcessingFile(false);
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // Remove uploaded file
  const removeFile = async (fileId) => {
    const updatedFiles = uploadedFiles.filter(file => file.id !== fileId);
    setUploadedFiles(updatedFiles);
    await saveToFirestore(messages, updatedFiles);
  };

  // Send message to Gemini AI
  const sendMessageToAI = async (userMessage) => {
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: `You are a comprehensive AI assistant. Provide detailed, well-formatted responses with:
        - Clear headings using ## for main sections
        - Bullet points using - or * for lists
        - **Bold text** for important points
        - \`inline code\` for technical terms
        - \`\`\`code blocks\`\`\` for longer code examples
        - Numbered lists for step-by-step instructions
        
        Always format your responses clearly and professionally. When analyzing files, provide thorough analysis with proper formatting.`
      });

      const generationConfig = {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      };

      // Prepare context with file contents
      let contextMessage = userMessage;
      if (uploadedFiles.length > 0) {
        contextMessage += '\n\nUploaded files context:\n';
        uploadedFiles.forEach(file => {
          if (file.type === 'text' || file.type === 'code') {
            contextMessage += `\n--- ${file.name} ---\n${file.content}\n`;
          } else if (file.type === 'image') {
            contextMessage += `\n--- ${file.name} (image) ---\nImage content available for analysis\n`;
          } else {
            contextMessage += `\n--- ${file.name} ---\nFile uploaded but content extraction not implemented for this type\n`;
          }
        });
      }

      const chatSession = model.startChat({
        generationConfig,
        history: messages.slice(-10).map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }))
      });

      const result = await chatSession.sendMessage(contextMessage);
      return result.response.text();
    } catch (error) {
      console.error('Error calling Gemini AI:', error);
      throw new Error('Failed to get AI response. Please try again.');
    }
  };

  // Handle sending a message
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);
    setError('');

    // Add user message
    const userMsgObj = {
      id: Date.now().toString(),
      text: userMessage,
      sender: 'user',
      timestamp: new Date().toISOString(),
      hasFiles: uploadedFiles.length > 0
    };

    const updatedMessages = [...messages, userMsgObj];
    setMessages(updatedMessages);

    try {
      // Get AI response
      const aiResponse = await sendMessageToAI(userMessage);

      // Add AI message with formatted content
      const aiMsgObj = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        formattedText: formatAIResponse(aiResponse),
        sender: 'ai',
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, aiMsgObj];
      setMessages(finalMessages);

      // Save to Firestore
      await saveToFirestore(finalMessages, uploadedFiles);

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error.message || 'Failed to send message');

      // Remove the user message if AI response failed
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press in textarea
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Clear current chat
  const handleClearChat = async () => {
    if (window.confirm('Are you sure you want to clear this chat and remove all uploaded files?')) {
      setMessages([]);
      setUploadedFiles([]);
      if (currentSessionId) {
        await saveToFirestore([], []);
      }
    }
  };

  // Delete a session permanently from Firestore
  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();

    if (!window.confirm('Are you sure you want to permanently delete this session? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeletingSession(true);
      setError('');

      await deleteDoc(doc(db, 'sessions', sessionId));
      setSessions(prevSessions => prevSessions.filter(session => session.id !== sessionId));

      if (sessionId === currentSessionId) {
        const remainingSessions = sessions.filter(session => session.id !== sessionId);

        if (remainingSessions.length > 0) {
          await loadSession(remainingSessions[0].id);
        } else {
          await createNewSession();
        }
      }

    } catch (error) {
      console.error('Error deleting session:', error);
      setError(`Failed to delete session: ${error.message}`);
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format session date
  const formatSessionDate = (date) => {
    if (!date) return '';
    const sessionDate = date.toDate ? date.toDate() : new Date(date);
    return sessionDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoadingSessions) {
    return (
      <div className="app">
        <div className="loading-app">
          <div className="loading-spinner"></div>
          <p>Loading your AI assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="chat-container">
        {/* Session Sidebar */}
        <div className={`session-sidebar ${showSessionList ? 'open' : ''}`}>
          <div className="session-header">
            <h3>Chat Sessions</h3>
            <div className="header-controls">
              <button
                className="theme-toggle"
                onClick={toggleDarkMode}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
              <button
                className="close-sidebar"
                onClick={() => setShowSessionList(false)}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">
                <p>No chat sessions yet.</p>
                <p>Create your first session to get started!</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${session.id === currentSessionId ? 'active' : ''} ${isDeletingSession ? 'deleting' : ''}`}
                  onClick={() => {
                    if (!isDeletingSession) {
                      loadSession(session.id);
                      setShowSessionList(false);
                    }
                  }}
                >
                  <div className="session-content">
                    <div className="session-title">{session.title}</div>
                    <div className="session-date">
                      {formatSessionDate(session.createdAt)}
                    </div>
                    {session.files && session.files.length > 0 && (
                      <div className="session-files">
                        📎 {session.files.length} file{session.files.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <button
                    className="delete-session"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    disabled={isDeletingSession}
                    title="Delete this session permanently"
                  >
                    {isDeletingSession ? '⏳' : '🗑️'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="chat-main">
          {/* Header */}
          <header className="chat-header">
            <div className="header-content">
              <div className="header-left">
                <button
                  className="btn btn-ghost sessions-toggle"
                  onClick={() => setShowSessionList(!showSessionList)}
                >
                  <span className="btn-icon">📋</span>
                  Sessions ({sessions.length})
                </button>
                <h1 className="chat-title">
                  <span className="ai-icon">🤖</span>
                  AI Assistant Pro
                </h1>
              </div>
              <div className="header-actions">
                <button
                  className="btn btn-ghost theme-toggle-header"
                  onClick={toggleDarkMode}
                  title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  <span className="btn-icon">{isDarkMode ? '☀️' : '🌙'}</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={createNewSession}
                  disabled={isLoading || isDeletingSession}
                >
                  <span className="btn-icon">➕</span>
                  New Session
                </button>
                <button
                  className="btn btn-outline"
                  onClick={handleClearChat}
                  disabled={isLoading || (messages.length === 0 && uploadedFiles.length === 0) || isDeletingSession}
                >
                  <span className="btn-icon">🗑️</span>
                  Clear
                </button>
              </div>
            </div>
          </header>

          {/* Uploaded Files Display */}
          {uploadedFiles.length > 0 && (
            <div className="uploaded-files">
              <div className="files-header">
                <span className="files-title">📎 Uploaded Files ({uploadedFiles.length})</span>
              </div>
              <div className="files-list">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      className="remove-file"
                      onClick={() => removeFile(file.id)}
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <main className="messages-area">
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="welcome-message">
                  <div className="welcome-content">
                    <span className="welcome-icon">🤖</span>
                    <h2>Welcome to AI Assistant Pro!</h2>
                    <p>I'm your comprehensive AI assistant. I can help you with programming, code analysis, file processing, and much more!</p>
                    <div className="feature-list">
                      <div className="feature-item">
                        <span className="feature-icon">💻</span>
                        <span>Code analysis & debugging</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">📁</span>
                        <span>File upload & analysis</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">🌙</span>
                        <span>Dark/Light mode</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">💾</span>
                        <span>Persistent chat sessions</span>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`message ${message.sender}`}>
                    <div className="message-avatar">
                      {message.sender === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        {message.sender === 'ai' && message.formattedText ? (
                          <div
                            className="formatted-ai-response"
                            dangerouslySetInnerHTML={{ __html: message.formattedText }}
                          />
                        ) : (
                          <>
                            {message.text}
                            {message.hasFiles && (
                              <div className="message-files-indicator">
                                <span className="files-icon">📎</span>
                                <span>Includes file analysis</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="message-time">
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="message ai">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="loading-indicator">
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <span className="loading-text">AI is analyzing...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </main>

          {/* Error Message */}
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
              <button
                className="error-close"
                onClick={() => setError('')}
              >
                ✕
              </button>
            </div>
          )}

          {/* Input Area */}
          <footer className="input-area">
            <form onSubmit={handleSendMessage} className="input-form">
              <div className="input-container">
                <div className="input-row">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything about coding, upload files for analysis..."
                    className="message-input"
                    disabled={isLoading || isDeletingSession || isProcessingFile}
                    rows="1"
                  />
                  <div className="input-actions">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.php,.rb,.go,.rs,.swift,.kt,.html,.css,.xml,.pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="attach-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading || isDeletingSession || isProcessingFile}
                      title="Upload files"
                    >
                      <span className="attach-icon">
                        {isProcessingFile ? '⏳' : '📎'}
                      </span>
                    </button>
                    <button
                      type="submit"
                      className="send-button"
                      disabled={!inputMessage.trim() || isLoading || isDeletingSession || isProcessingFile}
                    >
                      <span className="send-icon">
                        {isLoading ? '⏳' : '🚀'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </footer>
        </div>

        {/* Overlay for mobile session sidebar */}
        {showSessionList && (
          <div
            className="sidebar-overlay"
            onClick={() => setShowSessionList(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;