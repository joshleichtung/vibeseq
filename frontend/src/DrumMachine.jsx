import { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';

const DrumMachine = () => {
  const [pattern, setPattern] = useState({
    kick: Array(16).fill(false),
    snare: Array(16).fill(false),
    hihat: Array(16).fill(false),
    openhat: Array(16).fill(false),
  });

  const [params, setParams] = useState({
    kick: { pitch: 60, decay: 0.3, volume: 0.8 },
    snare: { pitch: 200, decay: 0.2, volume: 0.7 },
    hihat: { pitch: 800, decay: 0.1, volume: 0.6 },
    openhat: { pitch: 1000, decay: 0.4, volume: 0.5 },
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [connected, setConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isCompanionMode, setIsCompanionMode] = useState(
    window.location.pathname === '/companion'
  );

  const sequenceRef = useRef(null);
  const synthsRef = useRef({});
  const wsRef = useRef(null);

  // Initialize audio synthesis
  useEffect(() => {
    const initAudio = async () => {
      // Skip audio initialization in companion mode
      if (isCompanionMode) {
        console.log('Companion mode: Audio disabled');
        return;
      }
      
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      // Create drum synthesizers
      synthsRef.current = {
        kick: new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 10,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).toDestination(),

        snare: new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.0 }
        }).toDestination(),

        hihat: new Tone.MetalSynth({
          frequency: 200,
          envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5
        }).toDestination(),

        openhat: new Tone.MetalSynth({
          frequency: 200,
          envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5
        }).toDestination()
      };

      // Apply initial parameters
      updateSynthParams();
    };

    initAudio();

    return () => {
      Object.values(synthsRef.current).forEach(synth => {
        if (synth.dispose) synth.dispose();
      });
    };
  }, [isCompanionMode]);

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:4567/`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnected(true);
        console.log('Connected to drum machine server');
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'state_update':
            console.log('Received state update:', data.data);
            setPattern({
              kick: data.data.tracks.kick.pattern,
              snare: data.data.tracks.snare.pattern,
              hihat: data.data.tracks.hihat.pattern,
              openhat: data.data.tracks.openhat.pattern,
            });
            setParams({
              kick: data.data.tracks.kick.params,
              snare: data.data.tracks.snare.params,
              hihat: data.data.tracks.hihat.params,
              openhat: data.data.tracks.openhat.params,
            });
            setBpm(data.data.bpm);
            setIsPlaying(data.data.playing);
            setCurrentStep(data.data.current_step);
            break;

          case 'pattern_update':
            setPattern(prev => ({
              ...prev,
              [data.data.track]: prev[data.data.track].map((step, i) => 
                i === data.data.step ? data.data.active : step
              )
            }));
            break;

          case 'params_update':
            setParams(prev => ({
              ...prev,
              [data.data.track]: data.data.params
            }));
            break;

          case 'transport_update':
            setIsPlaying(data.data.playing);
            setCurrentStep(data.data.current_step);
            setBpm(data.data.bpm);
            break;

          case 'step_position':
            setCurrentStep(data.data.current_step);
            break;
        }
      };

      wsRef.current.onclose = () => {
        setConnected(false);
        console.log('Disconnected from server');
        // Retry connection after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Update synthesizer parameters
  const updateSynthParams = () => {
    if (!synthsRef.current.kick) return;

    // Update kick parameters
    if (synthsRef.current.kick.frequency) {
      synthsRef.current.kick.frequency.value = params.kick.pitch;
    }
    synthsRef.current.kick.volume.value = Tone.gainToDb(params.kick.volume);

    // Update snare parameters  
    synthsRef.current.snare.volume.value = Tone.gainToDb(params.snare.volume);

    // Update hihat parameters
    synthsRef.current.hihat.frequency.value = params.hihat.pitch;
    synthsRef.current.hihat.volume.value = Tone.gainToDb(params.hihat.volume);

    // Update open hat parameters
    synthsRef.current.openhat.frequency.value = params.openhat.pitch;
    synthsRef.current.openhat.volume.value = Tone.gainToDb(params.openhat.volume);
  };

  useEffect(() => {
    updateSynthParams();
  }, [params]);

  // Sequencer logic
  useEffect(() => {
    if (isPlaying) {
      if (!isCompanionMode) {
        // Audio mode: full audio synthesis
        Tone.Transport.bpm.value = bpm;
        
        sequenceRef.current = new Tone.Sequence((time, step) => {
          // Trigger sounds for active steps
          Object.keys(pattern).forEach(track => {
            if (pattern[track][step] && synthsRef.current[track]) {
              if (track === 'kick') {
                synthsRef.current[track].triggerAttackRelease(params[track].pitch, params[track].decay, time);
              } else if (track === 'snare') {
                synthsRef.current[track].triggerAttackRelease(params[track].decay, time);
              } else {
                synthsRef.current[track].triggerAttackRelease(params[track].pitch, params[track].decay, time);
              }
            }
          });

          // Update current step for UI
          Tone.Draw.schedule(() => {
            setCurrentStep(step);
            sendWebSocketMessage({
              type: 'step_update',
              step: step
            });
          }, time);
        }, Array.from({length: 16}, (_, i) => i), '16n');

        sequenceRef.current.start(0);
        Tone.Transport.start();
      } else {
        // Companion mode: visual-only sequencer using setInterval
        const stepDuration = (60 / bpm / 4) * 1000; // Duration per 16th note in ms
        let currentStepLocal = 0;
        
        const interval = setInterval(() => {
          setCurrentStep(currentStepLocal);
          sendWebSocketMessage({
            type: 'step_update',
            step: currentStepLocal
          });
          currentStepLocal = (currentStepLocal + 1) % 16;
        }, stepDuration);
        
        // Store interval reference for cleanup
        sequenceRef.current = { stop: () => clearInterval(interval), dispose: () => {} };
      }
    } else {
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        if (sequenceRef.current.dispose) {
          sequenceRef.current.dispose();
        }
      }
      if (!isCompanionMode) {
        Tone.Transport.stop();
      }
      setCurrentStep(0);
    }

    return () => {
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        if (sequenceRef.current.dispose) {
          sequenceRef.current.dispose();
        }
      }
    };
  }, [isPlaying, pattern, params, bpm, isCompanionMode]);

  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const toggleStep = async (track, step) => {
    // Initialize audio on first user interaction (only in audio mode)
    if (!isCompanionMode && Tone.context.state !== 'running') {
      try {
        await Tone.start();
        console.log('Audio context started via step click');
      } catch (error) {
        console.error('Failed to start audio:', error);
      }
    }
    
    sendWebSocketMessage({
      type: 'toggle_step',
      track: track,
      step: step
    });
  };

  const updateParams = (track, newParams) => {
    sendWebSocketMessage({
      type: 'update_params',
      track: track,
      params: newParams
    });
  };

  const handlePlay = async () => {
    try {
      if (!isCompanionMode && Tone.context.state !== 'running') {
        await Tone.start();
        console.log('Audio context started');
      }
      
      sendWebSocketMessage({
        type: 'transport_control',
        action: 'play'
      });
    } catch (error) {
      console.error('Failed to start audio:', error);
    }
  };

  const handleStop = () => {
    sendWebSocketMessage({
      type: 'transport_control',
      action: 'stop'
    });
  };

  const handleBpmChange = (newBpm) => {
    sendWebSocketMessage({
      type: 'transport_control',
      action: 'set_bpm',
      bpm: newBpm
    });
  };

  const handleClearPattern = () => {
    console.log('Clearing pattern...');
    sendWebSocketMessage({
      type: 'clear_pattern'
    });
  };

  const toggleMode = () => {
    const newMode = !isCompanionMode;
    setIsCompanionMode(newMode);
    
    // Update URL without page refresh
    const newPath = newMode ? '/companion' : '/';
    window.history.pushState({}, '', newPath);
  };

  const getVintageStepClasses = (track, active, stepIndex, currentStep, connected) => {
    const baseClasses = 'w-12 h-12 rounded-lg border-2 font-bold text-xs transition-all duration-200 transform';
    const currentStepClasses = currentStep === stepIndex ? 'ring-4 ring-white scale-110' : '';
    const disabledClasses = !connected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    const hoverClasses = 'hover:scale-105 active:scale-95';
    
    let colorClasses = '';
    if (active) {
      // Step is ON - BRIGHT ORANGE
      colorClasses = 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/50';
    } else {
      // Step is OFF - dark
      colorClasses = 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600';
    }
    
    return `${baseClasses} ${colorClasses} ${currentStepClasses} ${hoverClasses} ${disabledClasses}`;
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-indigo-900 relative overflow-hidden">
        {/* Vaporwave Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-400/10 via-transparent to-pink-400/10"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-10 w-32 h-32 bg-pink-400/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-32 right-16 w-48 h-48 bg-cyan-400/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-purple-400/20 rounded-full blur-2xl"></div>
        </div>
        
        {/* Main Content Container */}
        <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-6xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-pink-300 to-cyan-300 bg-clip-text text-transparent">
              Collaborative Drum Machine
            </h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  console.log('Help button clicked, showHelp:', showHelp);
                  setShowHelp(true);
                }}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 rounded-full backdrop-blur-sm transition-all duration-200 flex items-center gap-2 font-medium"
              >
                <span>❓</span> Help
              </button>
              
              <button
                onClick={toggleMode}
                className={`px-4 py-2 rounded-full backdrop-blur-sm transition-all duration-200 flex items-center gap-2 font-medium border ${
                  isCompanionMode 
                    ? 'bg-purple-500/20 border-purple-400/30 text-purple-200 hover:bg-purple-500/30' 
                    : 'bg-orange-500/20 border-orange-400/30 text-orange-200 hover:bg-orange-500/30'
                }`}
              >
                <span>{isCompanionMode ? '🔇' : '🔊'}</span> 
                {isCompanionMode ? 'Companion' : 'Audio'}
              </button>
              
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm border ${
                connected 
                  ? 'bg-emerald-400/20 border-emerald-400/30 text-emerald-200' 
                  : 'bg-rose-400/20 border-rose-400/30 text-rose-200'
              }`}>
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`}></div>
                <span className="text-sm font-medium">{connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
          </div>

          {/* Drum Machine Container - Vintage 909 Style */}
          <div className="bg-gradient-to-br from-slate-200 to-slate-300 rounded-3xl p-12 shadow-2xl border-8 border-slate-400/50 backdrop-blur-sm relative">
            {/* Vintage Labels */}
            <div className="absolute top-4 left-8 bg-slate-700 text-slate-200 px-4 py-1 rounded-full text-xs font-bold tracking-wider">
              CR-909 COLLABORATIVE
            </div>
            {isCompanionMode && (
              <div className="absolute top-4 right-8 bg-purple-600 text-purple-100 px-4 py-1 rounded-full text-xs font-bold tracking-wider animate-pulse">
                🔇 COMPANION MODE
              </div>
            )}
            {/* Transport Controls */}
            <div className="flex items-center justify-center gap-6 mb-10 p-6 bg-slate-800 rounded-2xl shadow-inner border-4 border-slate-600/50">
              <button
                onClick={handlePlay}
                disabled={!connected}
                className="px-8 py-3 bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 disabled:from-slate-400 disabled:to-slate-500 rounded-xl font-bold text-slate-900 shadow-lg border-2 border-emerald-600 disabled:border-slate-600 transition-all duration-200 transform active:scale-95"
              >
                ▶ PLAY
              </button>
              <button
                onClick={handleStop}
                disabled={!connected}
                className="px-8 py-3 bg-gradient-to-b from-rose-400 to-rose-500 hover:from-rose-300 hover:to-rose-400 disabled:from-slate-400 disabled:to-slate-500 rounded-xl font-bold text-slate-900 shadow-lg border-2 border-rose-600 disabled:border-slate-600 transition-all duration-200 transform active:scale-95"
              >
                ■ STOP
              </button>
              <button
                onClick={handleClearPattern}
                disabled={!connected}
                className="px-8 py-3 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:from-slate-400 disabled:to-slate-500 rounded-xl font-bold text-slate-900 shadow-lg border-2 border-amber-600 disabled:border-slate-600 transition-all duration-200 transform active:scale-95"
              >
                ✕ CLEAR
              </button>
              <div className="flex items-center gap-3 bg-slate-700 px-6 py-3 rounded-xl border-2 border-slate-600">
                <label className="text-sm font-bold text-cyan-300 tracking-wider">TEMPO:</label>
                <input
                  type="range"
                  min="60"
                  max="180"
                  value={bpm}
                  onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                  disabled={!connected}
                  className="w-24 accent-cyan-400"
                />
                <span className="text-sm font-mono text-pink-300 bg-slate-900 px-3 py-1 rounded-lg border border-slate-600 min-w-[3rem] text-center">{bpm}</span>
              </div>
            </div>

            {/* Pattern Grid */}
            <div className="space-y-4">
              {Object.keys(pattern).map(track => (
                <div key={track} className="p-6 bg-slate-700 rounded-2xl border-4 border-slate-600/50 shadow-inner">
                  <div className="flex items-center gap-6 mb-6">
                    <h3 className="text-xl font-bold text-slate-100 capitalize w-24 bg-slate-800 px-4 py-2 rounded-lg border-2 border-slate-600 text-center tracking-wider">
                      {track.toUpperCase()}
                    </h3>
                    
                    {/* Parameter Controls */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                        <label className="text-cyan-300 font-bold tracking-wider">PITCH:</label>
                        <input
                          type="range"
                          min={track === 'kick' ? 40 : 100}
                          max={track === 'kick' ? 120 : 2000}
                          value={params[track].pitch}
                          onChange={(e) => updateParams(track, { ...params[track], pitch: parseInt(e.target.value) })}
                          disabled={!connected}
                          className="w-20 accent-cyan-400"
                        />
                        <span className="w-12 text-pink-300 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-600 text-center">{params[track].pitch}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                        <label className="text-cyan-300 font-bold tracking-wider">DECAY:</label>
                        <input
                          type="range"
                          min="0.1"
                          max="2"
                          step="0.1"
                          value={params[track].decay}
                          onChange={(e) => updateParams(track, { ...params[track], decay: parseFloat(e.target.value) })}
                          disabled={!connected}
                          className="w-20 accent-cyan-400"
                        />
                        <span className="w-10 text-pink-300 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-600 text-center">{params[track].decay}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                        <label className="text-cyan-300 font-bold tracking-wider">VOL:</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={params[track].volume}
                          onChange={(e) => updateParams(track, { ...params[track], volume: parseFloat(e.target.value) })}
                          disabled={!connected}
                          className="w-20 accent-cyan-400"
                        />
                        <span className="w-10 text-pink-300 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-600 text-center">{params[track].volume}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Step Grid */}
                  <div className="grid grid-cols-16 gap-3 p-4 bg-slate-800 rounded-xl border-2 border-slate-600">
                    {pattern[track].map((active, stepIndex) => (
                      <button
                        key={stepIndex}
                        onClick={() => {
                          console.log(`Clicking ${track} step ${stepIndex}, currently: ${active}`);
                          toggleStep(track, stepIndex);
                        }}
                        disabled={!connected}
                        className={`w-12 h-12 rounded-lg border-2 font-bold text-xs transition-all duration-200 transform cursor-pointer hover:scale-105 active:scale-95 ${
                          currentStep === stepIndex ? 'ring-4 ring-white scale-110' : ''
                        } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{
                          backgroundColor: active ? '#f97316' : '#374151',
                          borderColor: active ? '#ea580c' : '#4b5563',
                          color: active ? 'white' : '#d1d5db',
                          boxShadow: active ? '0 10px 15px -3px rgba(249, 115, 22, 0.5)' : 'none'
                        }}
                      >
                        {active ? '●' : stepIndex + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal - Rendered outside main container */}
      {showHelp && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
        >
          <div 
            style={{
              backgroundColor: '#1e293b',
              color: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '672px',
              width: '100%',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <button
              onClick={() => setShowHelp(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '32px',
                height: '32px',
                backgroundColor: '#475569',
                border: 'none',
                borderRadius: '50%',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
            
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#67e8f9', marginBottom: '24px' }}>
              🎵 How to Use the Drum Machine
            </h2>
            
            <p style={{ marginBottom: '16px' }}>
              <strong>Step Sequencer:</strong> Click numbered buttons to create a 16-step drum pattern.
            </p>
            <p style={{ marginBottom: '16px' }}>
              🟠 <strong>Orange buttons</strong> = sound will play | ⬜ <strong>Gray buttons</strong> = silent step
            </p>
            <p style={{ marginBottom: '16px' }}>
              <strong>Controls:</strong> ▶ PLAY, ■ STOP, ✕ CLEAR, TEMPO slider, and sound parameters (PITCH/DECAY/VOL)
            </p>
            <p style={{ marginBottom: '24px', textAlign: 'center', padding: '16px', backgroundColor: 'rgba(103, 232, 249, 0.1)', borderRadius: '8px' }}>
              🤝 <strong>Collaborative:</strong> Share this URL with friends to jam together in real-time!
            </p>
            
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  padding: '8px 24px',
                  backgroundColor: '#06b6d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DrumMachine;