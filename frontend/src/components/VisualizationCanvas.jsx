import { useRef, useEffect } from 'react';

const VisualizationCanvas = ({ analyzers, isPlaying, currentStep, isBackground = false }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const trackRingsRef = useRef({});

  // Vaporwave color palette
  const colors = {
    neonPink: '#FF10F0',
    hotPink: '#FF69B4', 
    electricGreen: '#39FF14',
    neonGreen: '#00FF41',
    cyan: '#00FFFF',
    teal: '#40E0D0',
    electricPurple: '#8A2BE2',
    magenta: '#DA70D6',
    background: 'linear-gradient(180deg, #000000 0%, #2D1B69 100%)'
  };

  // Initialize canvas and start animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size to full width
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Animation loop
    const animate = () => {
      if (!ctx || !canvas) return;
      
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear canvas with vaporwave background
      ctx.clearRect(0, 0, width, height);
      
      // Draw background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#000000');
      gradient.addColorStop(1, '#2D1B69');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw retro grid overlay
      drawGrid(ctx, width, height);

      if (isPlaying && analyzers) {
        // Check analyzers (only log once when missing)
        if (!analyzers.kick && !window.analyzerWarningShown) {
          console.log('⚠️ Analyzers not ready yet');
          window.analyzerWarningShown = true;
        }
        
        // Draw bottom ring visualizations for each track
        drawBottomRings(ctx, width, height, analyzers.kick || analyzers.master, 'kick');
        drawBottomRings(ctx, width, height, analyzers.snare || analyzers.master, 'snare');
        drawBottomRings(ctx, width, height, analyzers.hihat || analyzers.master, 'hihat');
        drawBottomRings(ctx, width, height, analyzers.openhat || analyzers.master, 'openhat');
        
        // Draw middle waveform visualizations for each track
        drawMiddleWaveforms(ctx, width, height, analyzers.kick || analyzers.master, 'kick');
        drawMiddleWaveforms(ctx, width, height, analyzers.snare || analyzers.master, 'snare');
        drawMiddleWaveforms(ctx, width, height, analyzers.hihat || analyzers.master, 'hihat');
        drawMiddleWaveforms(ctx, width, height, analyzers.openhat || analyzers.master, 'openhat');
        
        // Draw top particle visualizations for each track
        drawTopParticles(ctx, width, height, analyzers.kick || analyzers.master, 'kick');
        drawTopParticles(ctx, width, height, analyzers.snare || analyzers.master, 'snare');
        drawTopParticles(ctx, width, height, analyzers.hihat || analyzers.master, 'hihat');
        drawTopParticles(ctx, width, height, analyzers.openhat || analyzers.master, 'openhat');
        
        // Master analyzer test - draw a simple indicator when ANY audio is detected
        if (analyzers.master) {
          let masterData;
          try {
            masterData = analyzers.master.getValue();
          } catch (error) {
            console.error('Error getting master analyzer data:', error);
            return;
          }
          
          let masterAmplitude = 0;
          
          // Handle different types of analyzer data
          if (masterData instanceof Float32Array || masterData instanceof Uint8Array) {
            const dataArray = Array.from(masterData);
            // Calculate RMS for master analyzer
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const val = dataArray[i];
              if (!isNaN(val) && isFinite(val)) {
                const linear = Math.pow(10, val / 20);
                sum += linear * linear;
              }
            }
            masterAmplitude = Math.sqrt(sum / dataArray.length);
          } else if (Array.isArray(masterData) && masterData.length > 0) {
            // Calculate RMS for master analyzer
            let sum = 0;
            for (let i = 0; i < masterData.length; i++) {
              const val = masterData[i];
              if (!isNaN(val) && isFinite(val)) {
                const linear = Math.pow(10, val / 20);
                sum += linear * linear;
              }
            }
            masterAmplitude = Math.sqrt(sum / masterData.length);
          }
          
          if (masterAmplitude > 0.1) {
            console.log('🎵 Master audio:', masterAmplitude.toFixed(3));
            // Draw a small white indicator in center 
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 3 + (masterAmplitude * 20), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Pulse effect on current step
      if (currentStep !== null && isPlaying) {
        drawStepPulse(ctx, width, height, currentStep);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyzers, isPlaying, currentStep]);

  // Draw retro grid overlay
  const drawGrid = (ctx, width, height) => {
    ctx.strokeStyle = 'rgba(255, 16, 240, 0.1)'; // Faint neon pink
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  // Bottom spectrum visualizations - all tracks get frequency bars at bottom of screen
  const drawBottomRings = (ctx, width, height, analyzer, track) => {
    if (!analyzer) return;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error(`Error getting ${track} analyzer data:`, error);
      return;
    }
    
    // Handle different types of analyzer data
    let dataArray;
    if (data instanceof Float32Array || data instanceof Uint8Array) {
      dataArray = Array.from(data);
    } else if (Array.isArray(data)) {
      dataArray = data;
    } else {
      return; // Can't process this data type
    }
    
    if (!dataArray || dataArray.length === 0) return;
    
    // Position spectrum bars in quarters across bottom area
    const positions = {
      kick: { startX: width * 0.05, endX: width * 0.25 },
      snare: { startX: width * 0.25, endX: width * 0.5 },
      hihat: { startX: width * 0.5, endX: width * 0.75 },
      openhat: { startX: width * 0.75, endX: width * 0.95 }
    };
    
    const { startX, endX } = positions[track];
    const zoneWidth = endX - startX;
    const barWidth = zoneWidth / Math.min(dataArray.length, 32); // Limit bars for performance
    
    // Track-specific colors
    const trackColors = {
      kick: colors.neonPink,
      snare: colors.electricGreen,
      hihat: colors.cyan,
      openhat: colors.electricPurple
    };
    
    ctx.save();
    ctx.shadowColor = trackColors[track];
    ctx.shadowBlur = 10;
    
    // Only show first 32 bars for better visualization
    const displayData = dataArray.slice(0, 32);
    
    displayData.forEach((value, index) => {
      // Better normalization for FFT data (usually ranges from -160 to 0)
      const normalizedValue = Math.max(0, (value + 160) / 160);
      const barHeight = normalizedValue * height * 0.4; // Use bottom 40% of screen
      
      const x = startX + (index * barWidth);
      const y = height - barHeight; // Start from bottom
      
      // Only draw bars with some height
      if (barHeight > 2) {
        // Gradient for each track
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, trackColors[track]);
        gradient.addColorStop(1, trackColors[track] + '80'); // Semi-transparent at bottom
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
      }
    });
    
    ctx.restore();
  };

  // Middle waveform visualizations - all tracks get waveforms in middle area
  const drawMiddleWaveforms = (ctx, width, height, analyzer, track) => {
    if (!analyzer) return;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error(`Error getting ${track} analyzer data:`, error);
      return;
    }
    
    // Handle different types of analyzer data
    let dataArray;
    if (data instanceof Float32Array || data instanceof Uint8Array) {
      dataArray = Array.from(data);
    } else if (Array.isArray(data)) {
      dataArray = data;
    } else {
      return; // Can't process this data type
    }
    
    if (!dataArray || dataArray.length === 0) return;
    
    // Calculate RMS for activity detection
    const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
    
    // Position waveforms in vertical bands across middle area
    const positions = {
      kick: { startX: width * 0.1, endX: width * 0.3 },
      snare: { startX: width * 0.3, endX: width * 0.5 },
      hihat: { startX: width * 0.5, endX: width * 0.7 },
      openhat: { startX: width * 0.7, endX: width * 0.9 }
    };
    
    const { startX, endX } = positions[track];
    const zoneWidth = endX - startX;
    const centerY = height * 0.5; // Middle area
    
    // Track-specific colors
    const trackColors = {
      kick: colors.neonPink,
      snare: colors.electricGreen,
      hihat: colors.cyan,
      openhat: colors.electricPurple
    };
    
    // Only draw waveform if there's significant activity
    if (rms > 0.01) {
      ctx.save();
      ctx.strokeStyle = trackColors[track];
      ctx.lineWidth = 2 + rms * 8; // Variable line width based on amplitude
      ctx.shadowColor = trackColors[track];
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      
      // Downsample data for better visualization
      const step = Math.max(1, Math.floor(dataArray.length / 64));
      for (let i = 0; i < dataArray.length; i += step) {
        const x = startX + (i / dataArray.length) * zoneWidth;
        const y = centerY + (dataArray[i] * height * 0.3); // Amplitude
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      
      ctx.restore();
    }
  };

  // Top particle visualizations - all tracks get particles at top of screen
  const drawTopParticles = (ctx, width, height, analyzer, track) => {
    if (!analyzer) return;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error(`Error getting ${track} analyzer data:`, error);
      return;
    }
    
    // For waveform data, calculate RMS (root mean square) for better amplitude detection
    let amplitude = 0;
    if (data instanceof Float32Array || data instanceof Uint8Array) {
      const dataArray = Array.from(data);
      const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
      amplitude = rms;
    } else if (Array.isArray(data)) {
      const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
      amplitude = rms;
    } else {
      amplitude = Math.abs(data);
    }
    
    // Position particles across top area
    const positions = {
      kick: width * 0.2,
      snare: width * 0.4,
      hihat: width * 0.6,
      openhat: width * 0.8
    };
    
    const centerX = positions[track];
    const centerY = height * 0.15; // Top area
    
    // Track-specific colors
    const trackColors = {
      kick: colors.neonPink,
      snare: colors.electricGreen,
      hihat: colors.cyan,
      openhat: colors.electricPurple
    };
    
    if (amplitude > 0.01) {
      ctx.save();
      ctx.fillStyle = trackColors[track];
      ctx.shadowColor = trackColors[track];
      ctx.shadowBlur = 15;
      
      // Draw scattered particles with more sensitivity
      const particleCount = Math.min(12, 4 + amplitude * 20);
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 20 + amplitude * 100;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        
        ctx.beginPath();
        ctx.arc(x, y, 2 + amplitude * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  };


  // Step pulse effect
  const drawStepPulse = (ctx, width, height, step) => {
    const pulseX = (step / 16) * width;
    
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = colors.hotPink;
    ctx.shadowColor = colors.hotPink;
    ctx.shadowBlur = 30;
    
    // Vertical pulse line
    ctx.fillRect(pulseX - 2, 0, 4, height);
    
    ctx.restore();
  };

  return (
    <div 
      className={isBackground ? "w-full h-full" : "w-full h-48 relative overflow-hidden"}
      style={isBackground ? { width: '100vw', height: '100vh' } : {}}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          background: 'linear-gradient(180deg, #000000 0%, #2D1B69 100%)'
        }}
      />
      
      {/* Optional overlay text - hide when used as background to avoid clutter */}
      {!isBackground && (
        <div className="absolute top-4 left-4 text-cyan-400 text-sm font-mono opacity-60">
          VIBESEQ VISUAL
        </div>
      )}
    </div>
  );
};

export default VisualizationCanvas;