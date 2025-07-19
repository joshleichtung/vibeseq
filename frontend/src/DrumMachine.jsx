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

  const sequenceRef = useRef(null);
  const synthsRef = useRef({});
  const wsRef = useRef(null);

  // Initialize audio synthesis
  useEffect(() => {
    const initAudio = async () => {
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
  }, []);

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
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        sequenceRef.current.dispose();
      }
      Tone.Transport.stop();
      setCurrentStep(0);
    }

    return () => {
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        sequenceRef.current.dispose();
      }
    };
  }, [isPlaying, pattern, params, bpm]);

  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const toggleStep = (track, step) => {
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
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    
    sendWebSocketMessage({
      type: 'transport_control',
      action: 'play'
    });
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

  const trackColors = {
    kick: 'bg-red-500',
    snare: 'bg-blue-500', 
    hihat: 'bg-yellow-500',
    openhat: 'bg-green-500'
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">Collaborative Drum Machine</h1>
          <div className={`flex items-center gap-2 px-3 py-1 rounded ${connected ? 'bg-green-600' : 'bg-red-600'}`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-300' : 'bg-red-300'}`}></div>
            <span className="text-sm">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-4 mb-8 p-4 bg-gray-800 rounded-lg">
          <button
            onClick={handlePlay}
            disabled={!connected}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-medium"
          >
            Play
          </button>
          <button
            onClick={handleStop}
            disabled={!connected}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded font-medium"
          >
            Stop
          </button>
          <div className="flex items-center gap-2">
            <label className="text-sm">BPM:</label>
            <input
              type="range"
              min="60"
              max="180"
              value={bpm}
              onChange={(e) => handleBpmChange(parseInt(e.target.value))}
              disabled={!connected}
              className="w-20"
            />
            <span className="text-sm w-8">{bpm}</span>
          </div>
        </div>

        {/* Pattern Grid */}
        <div className="space-y-4">
          {Object.keys(pattern).map(track => (
            <div key={track} className="p-4 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-lg font-medium capitalize w-20">{track}</h3>
                
                {/* Parameter Controls */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <label>Pitch:</label>
                    <input
                      type="range"
                      min={track === 'kick' ? 40 : 100}
                      max={track === 'kick' ? 120 : 2000}
                      value={params[track].pitch}
                      onChange={(e) => updateParams(track, { ...params[track], pitch: parseInt(e.target.value) })}
                      disabled={!connected}
                      className="w-16"
                    />
                    <span className="w-12">{params[track].pitch}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label>Decay:</label>
                    <input
                      type="range"
                      min="0.1"
                      max="2"
                      step="0.1"
                      value={params[track].decay}
                      onChange={(e) => updateParams(track, { ...params[track], decay: parseFloat(e.target.value) })}
                      disabled={!connected}
                      className="w-16"
                    />
                    <span className="w-8">{params[track].decay}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label>Vol:</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={params[track].volume}
                      onChange={(e) => updateParams(track, { ...params[track], volume: parseFloat(e.target.value) })}
                      disabled={!connected}
                      className="w-16"
                    />
                    <span className="w-8">{params[track].volume}</span>
                  </div>
                </div>
              </div>
              
              {/* Step Grid */}
              <div className="grid grid-cols-16 gap-1">
                {pattern[track].map((active, stepIndex) => (
                  <button
                    key={stepIndex}
                    onClick={() => toggleStep(track, stepIndex)}
                    disabled={!connected}
                    className={`
                      w-12 h-12 rounded border-2 font-medium text-xs
                      ${active 
                        ? `${trackColors[track]} border-white` 
                        : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                      }
                      ${currentStep === stepIndex ? 'ring-2 ring-white' : ''}
                      disabled:opacity-50
                    `}
                  >
                    {stepIndex + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DrumMachine;