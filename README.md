# Collaborative Drum Machine

A real-time collaborative drum machine built for hackathons! Multiple users can connect and contribute to the same drum pattern simultaneously.

## Features

- **Real-time collaboration** - Multiple users can edit the same drum pattern
- **Web Audio synthesis** - High-quality drum sounds generated using Tone.js
- **Parameter controls** - Adjust pitch, decay, and volume for each drum track
- **16-step sequencer** - Classic drum machine pattern programming
- **WebSocket communication** - Real-time synchronization across all clients

## Tech Stack

### Backend
- **Sinatra** - Lightweight Ruby web framework
- **sinatra-websocket** - WebSocket support for real-time communication
- **Thin** - Event-driven web server

### Frontend
- **React** - Component-based UI framework
- **Vite** - Fast development build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Tone.js** - Web Audio synthesis library

## Quick Start

### 1. Install Backend Dependencies
```bash
bundle install
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 3. Start the Backend Server
```bash
# From the root directory
ruby app.rb
```
The backend will start on `http://localhost:4567`

### 4. Start the Frontend Development Server
```bash
# From the frontend directory
cd frontend
npm run dev
```
The frontend will start on `http://localhost:5173`

### 5. Open in Multiple Browser Windows
Open `http://localhost:5173` in multiple browser windows to test real-time collaboration!

## How It Works

1. **Backend State Management** - The Sinatra server maintains the global drum pattern state
2. **WebSocket Communication** - Real-time updates are broadcast to all connected clients
3. **Audio Synthesis** - Each client generates audio locally using Tone.js
4. **Pattern Synchronization** - Step patterns and parameter changes sync across all users

## Drum Tracks

- **Kick** - Low-frequency drum using MembraneSynth
- **Snare** - White noise percussion using NoiseSynth  
- **Hi-hat** - Closed metallic percussion using MetalSynth
- **Open Hat** - Open metallic percussion with longer decay

## Controls

- **Play/Stop** - Transport controls for the sequencer
- **BPM** - Tempo control (60-180 BPM)
- **Pattern Grid** - Click to toggle steps on/off
- **Parameter Sliders** - Adjust pitch, decay, and volume per track

## Development

This project was built for rapid hackathon development with hot-reloading and real-time collaboration features built-in.

### Architecture
- Backend handles state synchronization and WebSocket management
- Frontend handles audio synthesis and user interface
- Real-time updates ensure all users see changes immediately

Enjoy making beats together! 🥁