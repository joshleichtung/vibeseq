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
        // Draw visualizations for each track
        drawKickVisualization(ctx, width, height, analyzers.kick);
        drawSnareVisualization(ctx, width, height, analyzers.snare);
        drawHihatVisualization(ctx, width, height, analyzers.hihat);
        drawOpenhatVisualization(ctx, width, height, analyzers.openhat);
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
    if (!analyzer) return;
    
    const data = analyzer.getValue();
    const amplitude = Array.isArray(data) ? Math.max(...data.map(v => Math.abs(v))) : Math.abs(data);
    
    // Zone: Left quarter of canvas
    const centerX = width * 0.125;
    const centerY = height * 0.5;
    
    // Add new ring when kick hits (amplitude above threshold)
    if (amplitude > 0.1) {
      kickRingsRef.current.push({
        x: centerX,
        y: centerY,
        radius: 10,
        alpha: 1.0,
        maxRadius: 80 + (amplitude * 100)
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
    
    const data = analyzer.getValue();
    if (!Array.isArray(data)) return;
    
    // Zone: Left-center quarter
    const startX = width * 0.25;
    const endX = width * 0.5;
    const zoneWidth = endX - startX;
    const barWidth = zoneWidth / data.length;
    
    ctx.save();
    ctx.shadowColor = colors.electricGreen;
    ctx.shadowBlur = 10;
    
    data.forEach((value, index) => {
      const normalizedValue = (value + 140) / 140; // Normalize FFT data
      const barHeight = Math.max(0, normalizedValue * height * 0.8);
      
      const x = startX + (index * barWidth);
      const y = height - barHeight;
      
      // Gradient from electric green to neon green
      const gradient = ctx.createLinearGradient(0, y, 0, height);
      gradient.addColorStop(0, colors.electricGreen);
      gradient.addColorStop(1, colors.neonGreen);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
    
    ctx.restore();
  };

  // Hi-hat visualization - Cyan particle burst
  const drawHihatVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) return;
    
    // Zone: Right-center quarter
    const centerX = width * 0.625;
    const centerY = height * 0.5;
    
    // Simple amplitude-based particle effect placeholder
    const data = analyzer.getValue();
    const amplitude = Array.isArray(data) ? Math.max(...data.map(v => Math.abs(v))) : Math.abs(data);
    
    if (amplitude > 0.05) {
      ctx.save();
      ctx.fillStyle = colors.cyan;
      ctx.shadowColor = colors.cyan;
      ctx.shadowBlur = 15;
      
      // Draw scattered particles
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const distance = amplitude * 60;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        
        ctx.beginPath();
        ctx.arc(x, y, 3 + amplitude * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  };

  // Open hat visualization - Purple waveform
  const drawOpenhatVisualization = (ctx, width, height, analyzer) => {
    if (!analyzer) return;
    
    const data = analyzer.getValue();
    if (!Array.isArray(data)) return;
    
    // Zone: Right quarter
    const startX = width * 0.75;
    const endX = width;
    const zoneWidth = endX - startX;
    const centerY = height * 0.5;
    
    ctx.save();
    ctx.strokeStyle = colors.electricPurple;
    ctx.lineWidth = 3;
    ctx.shadowColor = colors.electricPurple;
    ctx.shadowBlur = 15;
    
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = startX + (index / data.length) * zoneWidth;
      const y = centerY + (value * height * 0.3);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    ctx.restore();
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