import { useState, useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

function App() {
  // Performance stats state
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);
  const [gpuName, setGpuName] = useState('Detecting GPU...');
  const [fpsHistory, setFpsHistory] = useState(Array(30).fill(60));

  // Simulation controls state
  const [objectCount, setObjectCount] = useState(200); // number of circles
  const [rotationSpeed, setRotationSpeed] = useState(1);
  const [primarySize, setPrimarySize] = useState(120);
  const [useBlur, setUseBlur] = useState(false);
  const [blurStrength, setBlurStrength] = useState(4);
  const [useNoise, setUseNoise] = useState(false);
  const [noiseStrength, setNoiseStrength] = useState(0.2);
  const [blendMode, setBlendMode] = useState('normal'); // normal, add, screen
  const [antialias, setAntialias] = useState(true);
  const [showParticles, setShowParticles] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [showCanvas, setShowCanvas] = useState(true);

  // Synchronized state reference to prevent stale closure bugs in PixiJS callbacks
  const stateRef = useRef({
    objectCount,
    rotationSpeed,
    primarySize,
    useBlur,
    blurStrength,
    useNoise,
    noiseStrength,
    blendMode,
    showParticles,
  });

  useEffect(() => {
    stateRef.current = {
      objectCount,
      rotationSpeed,
      primarySize,
      useBlur,
      blurStrength,
      useNoise,
      noiseStrength,
      blendMode,
      showParticles,
    };
  }, [objectCount, rotationSpeed, primarySize, useBlur, blurStrength, useNoise, noiseStrength, blendMode, showParticles]);

  const containerRef = useRef(null);
  const appRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Detect GPU info on mount
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          setGpuName(renderer || 'Unknown WebGL Renderer');
        } else {
          setGpuName(gl.getParameter(gl.RENDERER) || 'Generic WebGL Renderer');
        }
      } else {
        setGpuName('WebGL Not Supported');
      }
    } catch (e) {
      setGpuName('Error detecting GPU');
    }
  }, []);

  // Initialize and update PixiJS
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let initialized = false;
    let app = null;
    let resizeObserver = null;

    // Create Pixi Application
    const initPixi = async () => {
      app = new PIXI.Application();
      
      // Save reference
      appRef.current = app;

      // Initialize the application
      await app.init({
        resizeTo: containerRef.current,
        antialias: antialias,
        background: 0x0a0b10,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      initialized = true;

      if (destroyed) {
        app.destroy(true, { children: true });
        if (appRef.current === app) {
          appRef.current = null;
        }
        return;
      }

      // Append canvas to container
      containerRef.current.appendChild(app.canvas);

      // Create main rotating container (centered)
      const circleContainer = new PIXI.Container();
      app.stage.addChild(circleContainer);

      // Create orbital container for load particles
      const orbitalsContainer = new PIXI.Container();
      circleContainer.addChild(orbitalsContainer);

      // Positioning helper: centers the main container
      const updatePositions = () => {
        circleContainer.x = app.screen.width * 0.5;
        circleContainer.y = app.screen.height * 0.5;
      };

      updatePositions();

      // Graphics templates
      const outerGraphic = new PIXI.Graphics();
      const innerGraphic = new PIXI.Graphics();
      circleContainer.addChild(outerGraphic);
      circleContainer.addChild(innerGraphic);

      // List of active child graphics for GPU load testing
      const particles = [];

      // Re-populate children based on objectCount
      const setupElements = () => {
        // Read latest values from stateRef.current to prevent stale closures
        const {
          objectCount: currentObjectCount,
          primarySize: currentPrimarySize,
          blendMode: currentBlendMode,
          showParticles: currentShowParticles,
        } = stateRef.current;

        // Clear previous main circles
        outerGraphic.clear();
        innerGraphic.clear();

        // Remove old children
        particles.forEach(c => orbitalsContainer.removeChild(c));
        particles.length = 0;

        // Determine current blend mode
        let pixiBlendMode = 'normal';
        if (currentBlendMode === 'add') pixiBlendMode = 'add';
        else if (currentBlendMode === 'screen') pixiBlendMode = 'screen';

        // Draw outer rotating circle (Purple element)
        outerGraphic
          .circle(0, 0, currentPrimarySize)
          .stroke({ width: 2, color: 0xa855f7 });
        
        // Spoke lines for outer circle
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          outerGraphic
            .moveTo(0, 0)
            .lineTo(currentPrimarySize * Math.cos(angle), currentPrimarySize * Math.sin(angle))
            .stroke({ width: 0.5, color: 0xa855f7, alpha: 0.5 });
        }
        outerGraphic.blendMode = pixiBlendMode;

        // Draw inner contrarotating circle (White element)
        const innerSize = currentPrimarySize * 0.625;
        innerGraphic
          .circle(0, 0, innerSize)
          .stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
        
        // Spoke lines for inner circle
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2 + Math.PI / 4;
          innerGraphic
            .moveTo(0, 0)
            .lineTo(innerSize * Math.cos(angle), innerSize * Math.sin(angle))
            .stroke({ width: 1.0, color: 0xffffff, alpha: 0.4 });
        }
        innerGraphic.blendMode = pixiBlendMode;

        // Generate load-testing secondary circles (only if showParticles is true)
        if (currentShowParticles) {
          const secondaryCount = Math.max(0, currentObjectCount - 2);
          
          for (let i = 0; i < secondaryCount; i++) {
            const orbital = new PIXI.Graphics();
            
            // Random orbit radius starting from outer boundary of primary circle
            const r = currentPrimarySize + 25 + Math.random() * (currentPrimarySize * 1.5);
            const angle = Math.random() * Math.PI * 2;
            const size = 3 + Math.random() * 12;

            orbital
              .circle(0, 0, size)
              .fill({ color: 0xec4899, alpha: 0.4 + Math.random() * 0.6 });
            
            orbital.x = Math.cos(angle) * r;
            orbital.y = Math.sin(angle) * r;
            orbital.blendMode = pixiBlendMode;
            
            orbitalsContainer.addChild(orbital);
            particles.push(orbital);
          }
        }
      };

      setupElements();

      // Configure Filters
      const updateFilters = () => {
        const {
          useBlur: currentUseBlur,
          blurStrength: currentBlurStrength,
          useNoise: currentUseNoise,
          noiseStrength: currentNoiseStrength,
        } = stateRef.current;

        const filters = [];

        if (currentUseBlur) {
          const blurFilter = new PIXI.BlurFilter();
          blurFilter.blur = currentBlurStrength;
          filters.push(blurFilter);
        }

        if (currentUseNoise) {
          const noiseFilter = new PIXI.NoiseFilter();
          noiseFilter.noise = currentNoiseStrength;
          filters.push(noiseFilter);
        }

        app.stage.filters = filters.length > 0 ? filters : null;
      };

      updateFilters();

      // Animation ticker loop
      let lastTime = performance.now();
      let frameCount = 0;
      let fpsTimer = 0;

      const tickerCallback = () => {
        const now = performance.now();
        const deltaMs = now - lastTime;
        lastTime = now;

        // Keep track of MS per frame
        setMs(Math.round(deltaMs));

        // Update FPS calculations
        frameCount++;
        fpsTimer += deltaMs;
        if (fpsTimer >= 1000) {
          const currentFps = Math.round((frameCount * 1000) / fpsTimer);
          setFps(currentFps);
          setFpsHistory(prev => [...prev.slice(1), currentFps]);
          frameCount = 0;
          fpsTimer = 0;
        }

        // Read latest rotationSpeed from stateRef.current
        const { rotationSpeed: currentRotationSpeed } = stateRef.current;
        const rotationDelta = 0.015 * currentRotationSpeed;
        
        // Counter-rotating concentric circles animation
        outerGraphic.rotation += rotationDelta;
        innerGraphic.rotation -= rotationDelta * 1.5;
        orbitalsContainer.rotation += rotationDelta;

        // Subtle pulsing scale on main circles to show WebGL activity
        const pulse = 1 + Math.sin(now * 0.003) * 0.04;
        outerGraphic.scale.set(pulse);
        innerGraphic.scale.set(pulse);
      };

      app.ticker.add(tickerCallback);

      // Handle resize events
      resizeObserver = new ResizeObserver(() => {
        if (app && app.renderer) {
          app.renderer.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight
          );
          updatePositions();
        }
      });
      resizeObserver.observe(containerRef.current);

      // Store callbacks to trigger updates when state dependencies change
      app.updateState = () => {
        setupElements();
        updateFilters();
      };
    };

    initPixi();

    return () => {
      destroyed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (app && initialized) {
        app.destroy(true, { children: true });
        if (appRef.current === app) {
          appRef.current = null;
        }
      }
    };
  }, [antialias]); // Re-init application if antialiasing toggles

  // Update elements and filters when configuration state changes
  useEffect(() => {
    if (appRef.current && appRef.current.updateState) {
      appRef.current.updateState();
    }
  }, [objectCount, rotationSpeed, primarySize, useBlur, blurStrength, useNoise, noiseStrength, blendMode, showParticles]);

  // Determine color class for FPS HUD
  const getFpsClass = (val) => {
    if (val >= 55) return 'fps-good';
    if (val >= 35) return 'fps-warning';
    return 'fps-bad';
  };

  return (
    <>
      {/* Pixi Canvas Mounting Point */}
      <div 
        className="canvas-container" 
        ref={containerRef}
        style={{ display: showCanvas ? 'block' : 'none' }}
      ></div>

      {/* UI Panels Overlay */}
      <div className="ui-overlay">
        {/* Header Panel */}
        <header className="panel header-panel">
          <div className="header-title-group">
            <h1>WebGL GPU Performance Load Tester</h1>
            <p>PIXIJS V8 + REACT ENGINE</p>
          </div>
          <div className="gpu-info" title={gpuName}>
            GPU: {gpuName}
          </div>
        </header>

        {/* Left Control Panel */}
        <aside className="panel control-panel">
          <h2 className="section-title">Circles Rotation</h2>
          
          <div className="control-group">
            <div className="control-item">
              <div className="control-label-row">
                <span>Rotation Speed</span>
                <span className="control-value">{rotationSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
              />
            </div>
            
            <div className="control-item">
              <div className="control-label-row">
                <span>Circle Base Size</span>
                <span className="control-value">{primarySize}px</span>
              </div>
              <input
                type="range"
                min="40"
                max="250"
                step="5"
                value={primarySize}
                onChange={(e) => setPrimarySize(parseInt(e.target.value))}
              />
            </div>
          </div>

          <h2 className="section-title">GPU Load Multiplier</h2>
          
          <div className="control-group">
            <div className="control-item switch-row">
              <span>Show Particles</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showParticles}
                  onChange={(e) => setShowParticles(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            {showParticles && (
              <div className="control-item">
                <div className="control-label-row">
                  <span>WebGL Shape Count</span>
                  <span className="control-value">{objectCount}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="10000"
                  step="50"
                  value={objectCount}
                  onChange={(e) => setObjectCount(parseInt(e.target.value))}
                />
                <div className="btn-group" style={{ marginTop: '8px' }}>
                  <button className="btn" onClick={() => setObjectCount(2)}>2 (Min)</button>
                  <button className="btn" onClick={() => setObjectCount(2000)}>2,000</button>
                  <button className="btn" onClick={() => setObjectCount(5000)}>5,000</button>
                  <button className="btn btn-primary" onClick={() => setObjectCount(10000)}>10,000 (Max)</button>
                </div>
              </div>
            )}

            <div className="control-item">
              <div className="control-label-row">
                <span>WebGL Blend Mode</span>
              </div>
              <div className="btn-group">
                <button 
                  className={`btn ${blendMode === 'normal' ? 'btn-primary' : ''}`}
                  onClick={() => setBlendMode('normal')}
                >
                  Normal
                </button>
                <button 
                  className={`btn ${blendMode === 'add' ? 'btn-primary' : ''}`}
                  onClick={() => setBlendMode('add')}
                >
                  Additive
                </button>
              </div>
            </div>
          </div>

          <h2 className="section-title">GPU Shaders & Post-processing</h2>
          
          <div className="control-group">
            <div className="control-item switch-row">
              <span>Anti-aliasing (Rebuilds)</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={antialias}
                  onChange={(e) => setAntialias(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="control-item switch-row">
              <span>GPU Multi-pass Blur</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useBlur}
                  onChange={(e) => setUseBlur(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            {useBlur && (
              <div className="control-item">
                <div className="control-label-row">
                  <span>Blur Strength</span>
                  <span className="control-value">{blurStrength}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={blurStrength}
                  onChange={(e) => setBlurStrength(parseInt(e.target.value))}
                />
              </div>
            )}

            <div className="control-item switch-row">
              <span>GPU Noise Shader</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useNoise}
                  onChange={(e) => setUseNoise(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            {useNoise && (
              <div className="control-item">
                <div className="control-label-row">
                  <span>Noise Intensity</span>
                  <span className="control-value">{(noiseStrength * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={noiseStrength}
                  onChange={(e) => setNoiseStrength(parseFloat(e.target.value))}
                />
              </div>
            )}

            <div className="control-item switch-row">
              <span>Show Performance HUD</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showHUD}
                  onChange={(e) => setShowHUD(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>

            <div className="control-item switch-row">
              <span>Show Canvas</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showCanvas}
                  onChange={(e) => setShowCanvas(e.target.checked)}
                />
                <span className="slider-switch"></span>
              </label>
            </div>
          </div>
        </aside>

        {/* Right Stats HUD Panel */}
        {showHUD && (
          <section className="panel stats-panel">
            <h2 className="section-title">Performance HUD</h2>
            
            <div className="stat-row">
              <span className="stat-label">Frame Rate</span>
              <span className={`stat-value ${getFpsClass(fps)}`}>{fps} FPS</span>
            </div>

            <div className="stat-row">
              <span className="stat-label">Frame Latency</span>
              <span className="stat-value">{ms} ms</span>
            </div>

            <div className="stat-row">
              <span className="stat-label">Active Vertices/Draws</span>
              <span className="stat-value">{showParticles ? objectCount : 2} objects</span>
            </div>

            {/* Sparkline style performance history */}
            <div className="performance-graph">
              <div className="bar-container">
                {fpsHistory.map((historyFps, i) => (
                  <div
                    key={i}
                    className="graph-bar"
                    style={{
                      height: `${Math.min(100, (historyFps / 60) * 100)}%`,
                      backgroundColor: historyFps >= 55 ? '#10b981' : historyFps >= 35 ? '#f59e0b' : '#ef4444'
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export default App;
