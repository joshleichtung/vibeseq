import { useRef, useEffect } from 'react';

const VisualizationCanvas = ({ analyzers, isPlaying, currentStep }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const kickRingsRef = useRef([]);

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
        // Debug: Check if analyzers exist
        if (!analyzers.kick || !analyzers.snare || !analyzers.hihat || !analyzers.openhat) {
          console.log('Missing analyzers:', {
            kick: !!analyzers.kick,
            snare: !!analyzers.snare, 
            hihat: !!analyzers.hihat,
            openhat: !!analyzers.openhat
          });
        }
        
        // Draw visualizations for each track (with master analyzer fallback)
        drawKickVisualization(ctx, width, height, analyzers.kick || analyzers.master);
        drawSnareVisualization(ctx, width, height, analyzers.snare || analyzers.master);
        drawHihatVisualization(ctx, width, height, analyzers.hihat || analyzers.master);
        drawOpenhatVisualization(ctx, width, height, analyzers.openhat || analyzers.master);
        
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
          
          if (masterAmplitude > 0.001) {
            console.log('🎵 MASTER AUDIO DETECTED:', masterAmplitude);
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

  // Kick visualization - Neon pink pulse rings
  const drawKickVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) {
      console.log('Kick analyzer missing!');
      return;
    }
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error('Error getting analyzer data:', error);
      return;
    }
    
    let amplitude = 0;
    
    // Handle different types of analyzer data
    if (data instanceof Float32Array || data instanceof Uint8Array) {
      // Convert typed array to regular array for processing
      const dataArray = Array.from(data);
      
      // For FFT data, calculate RMS (root mean square) for better amplitude
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        if (!isNaN(val) && isFinite(val)) {
          // Convert dB to linear scale: 10^(dB/20)
          const linear = Math.pow(10, val / 20);
          sum += linear * linear;
        }
      }
      amplitude = Math.sqrt(sum / dataArray.length);
    } else if (Array.isArray(data) && data.length > 0) {
      // For FFT data, calculate RMS (root mean square) for better amplitude
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (!isNaN(val) && isFinite(val)) {
          // Convert dB to linear scale: 10^(dB/20)
          const linear = Math.pow(10, val / 20);
          sum += linear * linear;
        }
      }
      amplitude = Math.sqrt(sum / data.length);
    } else if (typeof data === 'number' && !isNaN(data) && isFinite(data)) {
      amplitude = Math.abs(data);
    }
    
    // Debug logging (less verbose)
    if (amplitude > 0.001) {
      console.log('Kick - Data type:', data?.constructor?.name || typeof data, 'Length:', data?.length || 'N/A', 'Amplitude:', amplitude);
    }
    
    // Zone: Left quarter of canvas
    const centerX = width * 0.125;
    const centerY = height * 0.5;
    
    // Much more sensitive threshold
    if (amplitude > 0.001) {
      console.log('🔥 KICK RING TRIGGERED! Amplitude:', amplitude);
      kickRingsRef.current.push({
        x: centerX,
        y: centerY,
        radius: 5,
        alpha: 1.0,
        maxRadius: 40 + (amplitude * 100)
      });
    }
    
    // Draw and update existing rings
    kickRingsRef.current = kickRingsRef.current.filter(ring => {
      ring.radius += 3;
      ring.alpha -= 0.03;
      
      if (ring.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = colors.neonPink;
        ctx.lineWidth = 3;
        ctx.shadowColor = colors.neonPink;
        ctx.shadowBlur = 20;
        
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        return true;
      }
      return false;
    });
  };

  // Snare visualization - Neon green spectrum bars
  const drawSnareVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) return;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error('Error getting snare analyzer data:', error);
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
    
    // Debug logging for snare
    const maxValue = Math.max(...dataArray);
    if (maxValue > -100) {
      console.log('Snare data range:', Math.min(...dataArray), 'to', maxValue);
    }
    
    // Zone: Left-center quarter
    const startX = width * 0.25;
    const endX = width * 0.5;
    const zoneWidth = endX - startX;
    const barWidth = zoneWidth / Math.min(dataArray.length, 32); // Limit bars for performance
    
    ctx.save();
    ctx.shadowColor = colors.electricGreen;
    ctx.shadowBlur = 10;
    
    // Only show first 32 bars for better visualization
    const displayData = dataArray.slice(0, 32);
    
    displayData.forEach((value, index) => {
      // Better normalization for FFT data (usually ranges from -160 to 0)
      const normalizedValue = Math.max(0, (value + 160) / 160);
      const barHeight = normalizedValue * height * 0.7;
      
      const x = startX + (index * barWidth);
      const y = height - barHeight;
      
      // Only draw bars with some height
      if (barHeight > 2) {
        // Gradient from electric green to neon green
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, colors.electricGreen);
        gradient.addColorStop(1, colors.neonGreen);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
      }
    });
    
    ctx.restore();
  };

  // Hi-hat visualization - Cyan particle burst
  const drawHihatVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) return;
    
    // Zone: Right-center quarter
    const centerX = width * 0.625;
    const centerY = height * 0.5;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error('Error getting hihat analyzer data:', error);
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
    
    // Debug logging for hihat
    if (amplitude > 0.01) {
      console.log('Hihat amplitude (RMS):', amplitude);
    }
    
    if (amplitude > 0.01) { // Much lower threshold
      ctx.save();
      ctx.fillStyle = colors.cyan;
      ctx.shadowColor = colors.cyan;
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

  // Open hat visualization - Purple waveform
  const drawOpenhatVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) return;
    
    let data;
    try {
      data = analyzer.getValue();
    } catch (error) {
      console.error('Error getting openhat analyzer data:', error);
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
    
    // Debug logging for openhat
    if (rms > 0.01) {
      console.log('Open hat RMS:', rms);
    }
    
    // Zone: Right quarter
    const startX = width * 0.75;
    const endX = width;
    const zoneWidth = endX - startX;
    const centerY = height * 0.5;
    
    // Only draw waveform if there's significant activity
    if (rms > 0.01) {
      ctx.save();
      ctx.strokeStyle = colors.electricPurple;
      ctx.lineWidth = 2 + rms * 8; // Variable line width based on amplitude
      ctx.shadowColor = colors.electricPurple;
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      
      // Downsample data for better visualization (every 4th sample)
      const step = Math.max(1, Math.floor(dataArray.length / 64));
      for (let i = 0; i < dataArray.length; i += step) {
        const x = startX + (i / dataArray.length) * zoneWidth;
        const y = centerY + (dataArray[i] * height * 0.4); // Increased amplitude
        
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
    <div className="w-full h-48 relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          background: 'linear-gradient(180deg, #000000 0%, #2D1B69 100%)'
        }}
      />
      
      {/* Optional overlay text */}
      <div className="absolute top-4 left-4 text-cyan-400 text-sm font-mono opacity-60">
        VIBESEQ VISUAL
      </div>
    </div>
  );
};

export default VisualizationCanvas;