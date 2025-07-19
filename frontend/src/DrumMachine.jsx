import { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import VisualizationCanvas from './components/VisualizationCanvas';

const DrumMachine = () => {
  const [pattern, setPattern] = useState({
    kick: Array(16).fill(false),
    snare: Array(16).fill(false),
    hihat: Array(16).fill(false),
    openhat: Array(16).fill(false),
    arp: Array(16).fill(true), // Always on for arpeggio
    bass: Array(16).fill(true), // Always on for bassline
  });

  const [params, setParams] = useState({
    kick: { pitch: 60, decay: 0.3, volume: 0.8, distortion: 0, delay: 0, chorus: 0 },
    snare: { pitch: 200, decay: 0.2, volume: 0.7, distortion: 0, delay: 0, chorus: 0 },
    hihat: { pitch: 800, decay: 0.1, volume: 0.6, distortion: 0, delay: 0, chorus: 0 },
    openhat: { pitch: 1000, decay: 0.4, volume: 0.5, distortion: 0, delay: 0, chorus: 0 },
    arp: { volume: 0.3, distortion: 0, delay: 0, chorus: 0, waveform: 'triangle' }, // Arpeggio with effects
    bass: { volume: 0.4 }, // Only volume control for bassline
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [connected, setConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isCompanionMode, setIsCompanionMode] = useState(
    window.location.pathname !== '/audio'
  );
  const [isVisualizationBackground, setIsVisualizationBackground] = useState(false);

  const sequenceRef = useRef(null);
  const synthsRef = useRef({});
  const analyzersRef = useRef({});
  const effectsRef = useRef({});
  const wsRef = useRef(null);
  const paramUpdateTimeouts = useRef({});
  
  // Musical patterns for arp and bass in C major
  const arpPattern = [
    // Cmaj7 arpeggio: C-E-G-B
    'C4', 'E4', 'G4', 'B4', 'C5', 'B4', 'G4', 'E4',
    // Fmaj7 arpeggio: F-A-C-E  
    'F4', 'A4', 'C5', 'E5', 'F5', 'E5', 'C5', 'A4'
  ];
  
  const bassPattern = [
    // Root notes with some movement
    'C2', 'C2', 'E2', 'G2', 'C2', 'C2', 'G2', 'E2',
    'F2', 'F2', 'A2', 'C3', 'F2', 'F2', 'C3', 'A2'
  ];

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

      // Create a single master analyzer to capture all audio more reliably
      const masterAnalyzer = new Tone.Analyser('fft', 1024);
      
      // Create analyzers for each track - all using FFT for frequency spectrum visualization
      analyzersRef.current = {
        kick: new Tone.Analyser('fft', 512),
        snare: new Tone.Analyser('fft', 512),
        hihat: new Tone.Analyser('fft', 512),
        openhat: new Tone.Analyser('fft', 512),
        arp: new Tone.Analyser('fft', 512),
        bass: new Tone.Analyser('fft', 512),
        master: masterAnalyzer // Add master analyzer
      };

      // Create effects chains for each track
      try {
        effectsRef.current = {
          kick: {
            distortion: new Tone.Distortion(0),
            delay: new Tone.FeedbackDelay('8n', 0),
            chorus: new Tone.Chorus({frequency: 4, delayTime: 2.5, depth: 0}).start()
          },
          snare: {
            distortion: new Tone.Distortion(0),
            delay: new Tone.FeedbackDelay('8n', 0),
            chorus: new Tone.Chorus({frequency: 4, delayTime: 2.5, depth: 0}).start()
          },
          hihat: {
            distortion: new Tone.Distortion(0),
            delay: new Tone.FeedbackDelay('8n', 0),
            chorus: new Tone.Chorus({frequency: 4, delayTime: 2.5, depth: 0}).start()
          },
          openhat: {
            distortion: new Tone.Distortion(0),
            delay: new Tone.FeedbackDelay('8n', 0),
            chorus: new Tone.Chorus({frequency: 4, delayTime: 2.5, depth: 0}).start()
          },
          arp: {
            distortion: new Tone.Distortion(0),
            delay: new Tone.FeedbackDelay('8n', 0),
            chorus: new Tone.Chorus({frequency: 4, delayTime: 2.5, depth: 0}).start()
          }
        };
      } catch (error) {
        console.error('Failed to create effects:', error);
        // Fallback to simple effects without chorus
        effectsRef.current = {
          kick: { distortion: new Tone.Distortion(0), delay: new Tone.FeedbackDelay('8n', 0), chorus: null },
          snare: { distortion: new Tone.Distortion(0), delay: new Tone.FeedbackDelay('8n', 0), chorus: null },
          hihat: { distortion: new Tone.Distortion(0), delay: new Tone.FeedbackDelay('8n', 0), chorus: null },
          openhat: { distortion: new Tone.Distortion(0), delay: new Tone.FeedbackDelay('8n', 0), chorus: null },
          arp: { distortion: new Tone.Distortion(0), delay: new Tone.FeedbackDelay('8n', 0), chorus: null }
        };
      }

      // Create drum synthesizers - connect through effects chains to analyzers and master
      synthsRef.current = {
        kick: new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 10,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).chain(
          effectsRef.current.kick.distortion,
          effectsRef.current.kick.delay,
          ...(effectsRef.current.kick.chorus ? [effectsRef.current.kick.chorus] : [])
        ).fan(analyzersRef.current.kick, masterAnalyzer).toDestination(),

        snare: new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.0 }
        }).chain(
          effectsRef.current.snare.distortion,
          effectsRef.current.snare.delay,
          ...(effectsRef.current.snare.chorus ? [effectsRef.current.snare.chorus] : [])
        ).fan(analyzersRef.current.snare, masterAnalyzer).toDestination(),

        hihat: new Tone.MetalSynth({
          frequency: 200,
          envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5
        }).chain(
          effectsRef.current.hihat.distortion,
          effectsRef.current.hihat.delay,
          ...(effectsRef.current.hihat.chorus ? [effectsRef.current.hihat.chorus] : [])
        ).fan(analyzersRef.current.hihat, masterAnalyzer).toDestination(),

        openhat: new Tone.MetalSynth({
          frequency: 200,
          envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5
        }).chain(
          effectsRef.current.openhat.distortion,
          effectsRef.current.openhat.delay,
          ...(effectsRef.current.openhat.chorus ? [effectsRef.current.openhat.chorus] : [])
        ).fan(analyzersRef.current.openhat, masterAnalyzer).toDestination(),

        // Arpeggio synth - bright, sparkly sound
        arp: new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.1, decay: 0.3, sustain: 0.3, release: 0.8 }
        }).chain(
          effectsRef.current.arp.distortion,
          effectsRef.current.arp.delay,
          ...(effectsRef.current.arp.chorus ? [effectsRef.current.arp.chorus] : [])
        ).fan(analyzersRef.current.arp, masterAnalyzer).toDestination(),

        // Bass synth - deep, warm sound  
        bass: new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
          filter: { Q: 2, frequency: 120 }
        }).fan(analyzersRef.current.bass, masterAnalyzer).toDestination()
      };

      // Apply initial parameters
      updateSynthParams();
    };

    initAudio();

    return () => {
      Object.values(synthsRef.current).forEach(synth => {
        if (synth.dispose) synth.dispose();
      });
      Object.values(analyzersRef.current).forEach(analyzer => {
        if (analyzer.dispose) analyzer.dispose();
      });
      Object.values(effectsRef.current).forEach(effects => {
        Object.values(effects).forEach(effect => {
          if (effect.dispose) effect.dispose();
        });
      });
    };
  }, [isCompanionMode]);

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In development, connect to the Ruby backend on port 4567
      // In production, use the same host as the frontend
      const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '5173';
      const host = isDevelopment ? 'localhost:4567' : window.location.host;
      const wsUrl = `${protocol}//${host}/`;
      
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
              arp: Array(16).fill(true), // Keep arp always on
              bass: Array(16).fill(true), // Keep bass always on
            });
            setParams({
              kick: data.data.tracks.kick.params,
              snare: data.data.tracks.snare.params,
              hihat: data.data.tracks.hihat.params,
              openhat: data.data.tracks.openhat.params,
              arp: { volume: 0.3, distortion: 0, delay: 0, chorus: 0, waveform: 'triangle' }, // Keep local arp params with effects
              bass: { volume: 0.4 }, // Keep local bass params
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

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Only trigger if spacebar is pressed and not focused on an input
      if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault(); // Prevent page scroll
        if (connected) {
          handlePlayStop();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [connected, isPlaying]);

  // Update synthesizer parameters
  const updateSynthParams = () => {
    if (!synthsRef.current.kick || !effectsRef.current.kick) return;

    // Update kick parameters
    if (synthsRef.current.kick.frequency) {
      synthsRef.current.kick.frequency.value = params.kick.pitch;
    }
    synthsRef.current.kick.volume.value = Tone.gainToDb(params.kick.volume);
    if (synthsRef.current.kick.envelope) {
      synthsRef.current.kick.envelope.decay = params.kick.decay;
    }
    // Update kick effects
    if (typeof params.kick.distortion === 'number') {
      effectsRef.current.kick.distortion.distortion = params.kick.distortion;
    }
    if (typeof params.kick.delay === 'number') {
      effectsRef.current.kick.delay.wet.value = params.kick.delay;
    }
    if (effectsRef.current.kick.chorus && typeof params.kick.chorus === 'number') {
      effectsRef.current.kick.chorus.depth = params.kick.chorus;
    }

    // Update snare parameters  
    synthsRef.current.snare.volume.value = Tone.gainToDb(params.snare.volume);
    if (synthsRef.current.snare.envelope) {
      synthsRef.current.snare.envelope.decay = params.snare.decay;
    }
    // Update snare effects
    if (typeof params.snare.distortion === 'number') {
      effectsRef.current.snare.distortion.distortion = params.snare.distortion;
    }
    if (typeof params.snare.delay === 'number') {
      effectsRef.current.snare.delay.wet.value = params.snare.delay;
    }
    if (effectsRef.current.snare.chorus && typeof params.snare.chorus === 'number') {
      effectsRef.current.snare.chorus.depth = params.snare.chorus;
    }

    // Update hihat parameters
    synthsRef.current.hihat.frequency.value = params.hihat.pitch;
    synthsRef.current.hihat.volume.value = Tone.gainToDb(params.hihat.volume);
    if (synthsRef.current.hihat.envelope) {
      synthsRef.current.hihat.envelope.decay = params.hihat.decay;
    }
    // Update hihat effects
    if (typeof params.hihat.distortion === 'number') {
      effectsRef.current.hihat.distortion.distortion = params.hihat.distortion;
    }
    if (typeof params.hihat.delay === 'number') {
      effectsRef.current.hihat.delay.wet.value = params.hihat.delay;
    }
    if (effectsRef.current.hihat.chorus && typeof params.hihat.chorus === 'number') {
      effectsRef.current.hihat.chorus.depth = params.hihat.chorus;
    }

    // Update open hat parameters
    synthsRef.current.openhat.frequency.value = params.openhat.pitch;
    synthsRef.current.openhat.volume.value = Tone.gainToDb(params.openhat.volume);
    if (synthsRef.current.openhat.envelope) {
      synthsRef.current.openhat.envelope.decay = params.openhat.decay;
    }
    // Update openhat effects
    if (typeof params.openhat.distortion === 'number') {
      effectsRef.current.openhat.distortion.distortion = params.openhat.distortion;
    }
    if (typeof params.openhat.delay === 'number') {
      effectsRef.current.openhat.delay.wet.value = params.openhat.delay;
    }
    if (effectsRef.current.openhat.chorus && typeof params.openhat.chorus === 'number') {
      effectsRef.current.openhat.chorus.depth = params.openhat.chorus;
    }

    // Update arp parameters
    if (synthsRef.current.arp && typeof params.arp.volume === 'number') {
      synthsRef.current.arp.volume.value = Tone.gainToDb(params.arp.volume);
    }
    // Update arp waveform
    if (synthsRef.current.arp && params.arp.waveform) {
      try {
        synthsRef.current.arp.set({
          oscillator: { type: params.arp.waveform }
        });
      } catch (error) {
        console.error('Failed to set arp waveform:', error);
      }
    }
    // Update arp effects
    if (effectsRef.current.arp) {
      if (typeof params.arp.distortion === 'number') {
        effectsRef.current.arp.distortion.distortion = params.arp.distortion;
      }
      if (typeof params.arp.delay === 'number') {
        effectsRef.current.arp.delay.wet.value = params.arp.delay;
      }
      if (effectsRef.current.arp.chorus && typeof params.arp.chorus === 'number') {
        effectsRef.current.arp.chorus.depth = params.arp.chorus;
      }
    }

    // Update bass parameters
    if (synthsRef.current.bass && typeof params.bass.volume === 'number') {
      synthsRef.current.bass.volume.value = Tone.gainToDb(params.bass.volume);
    }
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
              } else if (track === 'arp') {
                // Play arpeggio note
                const note = arpPattern[step];
                synthsRef.current[track].triggerAttackRelease(note, '8n', time);
              } else if (track === 'bass') {
                // Play bass note
                const note = bassPattern[step];
                synthsRef.current[track].triggerAttackRelease(note, '4n', time);
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
    // Update local state immediately for responsive UI
    setParams(prev => ({
      ...prev,
      [track]: newParams
    }));
    
    // Debounce WebSocket updates to prevent audio stuttering
    if (paramUpdateTimeouts.current[track]) {
      clearTimeout(paramUpdateTimeouts.current[track]);
    }
    
    paramUpdateTimeouts.current[track] = setTimeout(() => {
      sendWebSocketMessage({
        type: 'update_params',
        track: track,
        params: newParams
      });
    }, 100); // 100ms debounce delay
  };

  const handlePlayStop = async () => {
    if (isPlaying) {
      // Stop
      sendWebSocketMessage({
        type: 'transport_control',
        action: 'stop'
      });
    } else {
      // Play
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
    }
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
    const newPath = newMode ? '/' : '/audio';
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Banner at top left */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-6">
        <img 
          src="/header.png" 
          alt="Collaborative Drum Machine" 
          className="max-h-[20vh] w-auto object-contain"
        />
        <div className="text-white font-bold bg-black/50 rounded-lg backdrop-blur-sm border border-white/20" style={{ fontSize: '4rem', padding: '2rem 3rem' }}>
          Join at vibeseq.fly.dev
        </div>
      </div>

      {/* Always show visualization as full-screen background */}
      <div 
        className="fixed top-0 left-0 z-0"
        style={{ 
          width: '100vw', 
          height: '100vh',
          pointerEvents: 'none' // Allow clicks to pass through to UI below
        }}
      >
        <VisualizationCanvas 
          analyzers={analyzersRef.current}
          isPlaying={isPlaying}
          currentStep={currentStep}
          isBackground={true}
        />
      </div>
      
      {/* Main Content Container - always on top but with conditional opacity */}
      <div 
        className={`relative z-10 min-h-screen flex items-start justify-center p-8 ${
          isVisualizationBackground ? 'bg-transparent' : 'bg-black/20'
        }`}
        style={{ paddingTop: '25vh' }}
      >
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

              <button
                onClick={() => setIsVisualizationBackground(!isVisualizationBackground)}
                className={`px-4 py-2 rounded-full backdrop-blur-sm transition-all duration-200 flex items-center gap-2 font-medium border ${
                  isVisualizationBackground 
                    ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/30' 
                    : 'bg-pink-500/20 border-pink-400/30 text-pink-200 hover:bg-pink-500/30'
                }`}
              >
                <span>{isVisualizationBackground ? '📺' : '🎨'}</span> 
                {isVisualizationBackground ? 'UI On Top' : 'Viz On Top'}
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
          <div className="rounded-3xl p-12 border-8 border-slate-400/20 backdrop-blur-sm relative bg-transparent">
            {/* Transport Controls */}
            <div className="flex items-center justify-start gap-12 mb-10 p-8 bg-slate-800/30 rounded-2xl border-4 border-slate-600/20 backdrop-blur-sm">
              {!isCompanionMode && (
                <button
                  onClick={handlePlayStop}
                  disabled={!connected}
                  className={`rounded-xl font-bold text-slate-900 shadow-lg border-2 transition-all duration-200 transform active:scale-95 ${
                    isPlaying
                      ? 'bg-gradient-to-b from-rose-400 to-rose-500 hover:from-rose-300 hover:to-rose-400 border-rose-600'
                      : 'bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 border-emerald-600'
                  } disabled:from-slate-400 disabled:to-slate-500 disabled:border-slate-600`}
                  style={{ padding: '1.5rem 3rem', fontSize: '1.5rem', minHeight: '4rem', minWidth: '8rem' }}
                >
                  {isPlaying ? '■ STOP' : '▶ PLAY'}
                </button>
              )}
              <button
                onClick={handleClearPattern}
                disabled={!connected}
                className="bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:from-slate-400 disabled:to-slate-500 rounded-xl font-bold text-slate-900 shadow-lg border-2 border-amber-600 disabled:border-slate-600 transition-all duration-200 transform active:scale-95"
                style={{ padding: '1.5rem 3rem', fontSize: '1.5rem', minHeight: '4rem', minWidth: '8rem' }}
              >
                ✕ CLEAR
              </button>
              <div className="flex items-center gap-6 bg-slate-700 rounded-xl border-2 border-slate-600" style={{ padding: '1.5rem 2rem' }}>
                <label className="font-bold text-cyan-300 tracking-wider" style={{ fontSize: '1.25rem' }}>TEMPO:</label>
                <input
                  type="range"
                  min="60"
                  max="180"
                  value={bpm}
                  onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                  disabled={!connected}
                  className="accent-cyan-400"
                  style={{ width: '12rem', height: '0.75rem' }}
                />
                <span className="font-mono text-pink-300 bg-slate-900 rounded-lg border border-slate-600 text-center" style={{ padding: '0.75rem 1.5rem', fontSize: '1.25rem', minWidth: '4rem' }}>{bpm}</span>
              </div>
            </div>

            {/* Pattern Grid */}
            <div className="space-y-4">
              {Object.keys(pattern).map(track => (
                <div key={track} className="p-6 bg-slate-700/20 rounded-2xl border-4 border-slate-600/20 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-3xl font-bold text-slate-100 capitalize bg-slate-800 py-3 px-8 rounded-lg border-2 border-slate-600 text-center tracking-wider">
                      {track.toUpperCase()}
                    </h3>
                    
                    {/* Parameter Controls */}
                    <div className="flex items-center gap-6 text-sm">
                      {track === 'bass' ? (
                        // Bass track - only volume control
                        <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                          <label className="text-cyan-300 font-bold tracking-wider w-16 text-left">VOL:</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={params[track].volume}
                            onChange={(e) => updateParams(track, { ...params[track], volume: parseFloat(e.target.value) })}
                            disabled={false}
                            className="w-20 accent-cyan-400"
                          />
                          <span className="w-10 text-pink-300 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-600 text-center">{params[track].volume}</span>
                        </div>
                      ) : track === 'arp' ? (
                        // Arp track - volume and waveform controls
                        <>
                          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                            <label className="text-cyan-300 font-bold tracking-wider w-16 text-left">VOL:</label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={params[track].volume}
                              onChange={(e) => updateParams(track, { ...params[track], volume: parseFloat(e.target.value) })}
                              disabled={false}
                              className="w-20 accent-cyan-400"
                            />
                            <span className="w-10 text-pink-300 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-600 text-center">{params[track].volume}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                            <label className="text-yellow-300 font-bold tracking-wider w-16 text-left">WAVE:</label>
                            <select
                              value={params[track].waveform}
                              onChange={(e) => updateParams(track, { ...params[track], waveform: e.target.value })}
                              disabled={false}
                              className="w-24 bg-slate-900 text-yellow-300 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                            >
                              <option value="sine">SINE</option>
                              <option value="triangle">TRI</option>
                              <option value="square">SQR</option>
                              <option value="sawtooth">SAW</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        // Drum tracks - full controls
                        <>
                          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                            <label className="text-cyan-300 font-bold tracking-wider w-16 text-left">PITCH:</label>
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
                            <label className="text-cyan-300 font-bold tracking-wider w-16 text-left">DECAY:</label>
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
                            <label className="text-cyan-300 font-bold tracking-wider w-16 text-left">VOL:</label>
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
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Effects Controls - for drum tracks and arp */}
                  {track !== 'bass' && (
                    <div className="flex items-center justify-end mb-4">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                          <label className="text-orange-300 font-bold tracking-wider w-12 text-left">DIST:</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={params[track].distortion}
                            onChange={(e) => updateParams(track, { ...params[track], distortion: parseFloat(e.target.value) })}
                            disabled={!connected}
                            className="w-16 accent-orange-400"
                          />
                          <span className="w-8 text-orange-300 font-mono bg-slate-800 px-1 py-1 rounded border border-slate-700 text-center text-xs">{params[track].distortion}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                          <label className="text-green-300 font-bold tracking-wider w-12 text-left">ECHO:</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={params[track].delay}
                            onChange={(e) => updateParams(track, { ...params[track], delay: parseFloat(e.target.value) })}
                            disabled={!connected}
                            className="w-16 accent-green-400"
                          />
                          <span className="w-8 text-green-300 font-mono bg-slate-800 px-1 py-1 rounded border border-slate-700 text-center text-xs">{params[track].delay}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                          <label className="text-purple-300 font-bold tracking-wider w-12 text-left">CHORUS:</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={params[track].chorus}
                            onChange={(e) => updateParams(track, { ...params[track], chorus: parseFloat(e.target.value) })}
                            disabled={!connected}
                            className="w-16 accent-purple-400"
                          />
                          <span className="w-8 text-purple-300 font-mono bg-slate-800 px-1 py-1 rounded border border-slate-700 text-center text-xs">{params[track].chorus}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Step Grid */}
                  <div className="grid grid-cols-16 gap-3 p-4 bg-slate-800/20 rounded-xl border-2 border-slate-600/20 backdrop-blur-sm">
                    {pattern[track].map((active, stepIndex) => (
                      <button
                        key={stepIndex}
                        onClick={() => {
                          console.log(`Clicking ${track} step ${stepIndex}, currently: ${active}`);
                          if (track !== 'arp' && track !== 'bass') {
                            toggleStep(track, stepIndex);
                          }
                        }}
                        disabled={!connected && track !== 'arp' && track !== 'bass'}
                        className={`w-12 h-12 rounded-lg border-2 font-bold text-xs transition-all duration-200 transform ${
                          track === 'arp' || track === 'bass' ? 'cursor-default' : 'cursor-pointer hover:scale-105 active:scale-95'
                        } ${
                          currentStep === stepIndex ? 'ring-4 ring-white scale-110' : ''
                        } ${(!connected && track !== 'arp' && track !== 'bass') ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{
                          backgroundColor: active ? (track === 'arp' ? '#10b981' : track === 'bass' ? '#8b5cf6' : '#f97316') : '#374151',
                          borderColor: active ? (track === 'arp' ? '#059669' : track === 'bass' ? '#7c3aed' : '#ea580c') : '#4b5563',
                          color: active ? 'white' : '#d1d5db',
                          boxShadow: active ? `0 10px 15px -3px ${track === 'arp' ? 'rgba(16, 185, 129, 0.5)' : track === 'bass' ? 'rgba(139, 92, 246, 0.5)' : 'rgba(249, 115, 22, 0.5)'}` : 'none'
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
              <strong>Controls:</strong> ▶ PLAY/STOP (or press <kbd style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>SPACEBAR</kbd>), ✕ CLEAR, TEMPO slider, and sound parameters (PITCH/DECAY/VOL)
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
    </div>
  );
};

export default DrumMachine;