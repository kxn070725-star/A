
import React, { useEffect, useRef, useState } from 'react';
import { SimulationConfig } from '../types';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

interface WeaveCanvasProps {
  config: SimulationConfig;
}

// --- SHADERS ---

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_uv;       // Grid coordinates (0..1)
in float a_index;   // Vertex ID

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_hand;   // Normalized hand position (0..1)
uniform vec2 u_handVel; // Normalized hand velocity
uniform float u_gesture; // 0=none, 1=fist(paint), 2=open(repel/wave), 3=double, 4=pinch(tension)
uniform sampler2D u_texture; // Source Video/Image
uniform sampler2D u_mask;    // Reveal Mask
uniform float u_aspect;

out vec3 v_color;
out float v_depth;
out float v_isQuantum;

#define PI 3.14159265359

void main() {
    // 1. Texture Sampling & Color Logic
    vec2 texCoord = vec2(a_uv.x, 1.0 - a_uv.y);
    vec4 texColor = texture(u_texture, texCoord);
    float maskVal = texture(u_mask, texCoord).r; // Red channel of mask (white = revealed)
    
    // Calculate Grayscale
    float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bwColor = vec3(gray * 0.8); // Slightly dim BW
    
    // Mix BW and Color based on mask
    vec3 baseColor = mix(bwColor, texColor.rgb * 1.5, maskVal); 
    
    if (length(texColor.rgb) < 0.01) baseColor = vec3(0.1);

    // 2. Quantum Status (Random highlights on grid intersections)
    bool isQuantum = (mod(a_index, 29.0) < 1.0);
    v_isQuantum = isQuantum ? 1.0 : 0.0;

    // 3. Position Logic
    vec3 pos = vec3(
        (a_uv.x - 0.5) * 2.0 * u_aspect, 
        (a_uv.y - 0.5) * 2.0, 
        0.0
    );

    vec2 handPos2D = vec2(u_hand.x * u_aspect, 1.0 - u_hand.y);
    float dist = distance(vec2(pos.x, pos.y), handPos2D);

    // --- INTERACTION LOGIC (Grid Warping) ---

    // A. Big Wave & Flow (OPEN HAND - Gesture 2)
    // "Change the pinch control line fluctuation to open hand... and increase the fluctuation arc"
    if (u_gesture > 1.5 && u_gesture < 2.5 && maskVal > 0.1) {
        float radius = 0.65; // Larger radius for open hand interaction
        if (dist < radius) {
            float influence = smoothstep(radius, 0.0, dist);
            
            // Sticky Pull: Warp grid loosely towards hand to guide the wave
            pos.xy = mix(pos.xy, handPos2D + (pos.xy - handPos2D) * 0.7, influence * 0.3);
            
            // MASSIVE WAVE: Move grid based on hand velocity
            // Significantly increased multiplier (from 3.0 to 12.0) for "bigger arc"
            pos.xy += u_handVel * influence * 12.0;
            
            // Deep Z-Warp: Add significant depth to the weave
            // Increased amplitude (from 0.3 to 1.2) and adjusted frequency
            pos.z += sin(dist * 12.0 - u_time * 6.0) * influence * 1.2;
            
            // Color Shift on Wave
            baseColor += vec3(0.0, 0.4, 0.6) * influence;
        }
    } 
    // B. Smear/Paint Indentation (FIST - Gesture 1)
    else if (u_gesture > 0.5 && u_gesture < 1.5) {
         if (dist < 0.25) {
             pos.z -= (0.25 - dist) * 0.6; // Press down
         }
    }
    // C. Precision Tension (PINCH - Gesture 4)
    // Swapped old Open Hand logic here but made it tighter/sharper
    else if (u_gesture > 3.5) {
         if (dist < 0.3) {
            float strength = (0.3 - dist) / 0.3;
            // High frequency ripple (Tension)
            float tension = sin(dist * 60.0 - u_time * 12.0) * strength * 0.1;
            pos.z += tension;
            // Slight pinch/contract effect
            pos.xy = mix(pos.xy, handPos2D, strength * 0.05);
            
            baseColor += vec3(0.3, 0.0, 0.3) * strength;
         }
    }

    gl_Position = vec4(pos.x, pos.y, pos.z, 1.0);
    
    v_depth = pos.z;
    v_color = baseColor;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_depth;
in float v_isQuantum;

uniform float u_brightness;

out vec4 fragColor;

void main() {
    // Basic Line Rendering
    vec3 finalColor = v_color * u_brightness;
    
    // Highlights
    if (v_isQuantum > 0.5) {
        finalColor *= 1.3;
    }

    // Depth Fade for 3D effect
    float alpha = clamp(0.6 + v_depth * 0.8, 0.1, 0.8);

    fragColor = vec4(finalColor, alpha);
}
`;

export const WeaveCanvas: React.FC<WeaveCanvasProps> = ({ config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const overlayRef = useRef<HTMLCanvasElement>(null); 
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const buffersRef = useRef<any>({});
  
  const videoTextureRef = useRef<WebGLTexture | null>(null);
  const maskTextureRef = useRef<WebGLTexture | null>(null);

  const animFrameId = useRef<number>(0);
  const startTime = useRef<number>(performance.now());
  
  const handPos = useRef({ x: 0.5, y: 0.5 });
  const prevHandPos = useRef({ x: 0.5, y: 0.5 });
  const handVel = useRef({ x: 0, y: 0 });
  const gesture = useRef(0); 

  const revealMaskRef = useRef<HTMLCanvasElement | null>(null); 
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null); 
  const staticImageRef = useRef<HTMLImageElement | null>(null);

  // --- Helpers ---
  const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const createTexture = (gl: WebGL2RenderingContext) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  };

  const initWebGL = (count: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) return;
    glRef.current = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;
    
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Grid Generation (Mesh)
    const aspect = canvas.width / canvas.height;
    const rows = Math.ceil(Math.sqrt(count / aspect));
    const cols = Math.ceil(count / rows);
    const numVertices = rows * cols;
    
    const uvData = new Float32Array(numVertices * 2);
    const indexData = new Float32Array(numVertices); // Attribute for vertex ID
    const lineIndices: number[] = []; // Element Buffer for Lines
    
    let ptr = 0;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            uvData[ptr * 2] = i / (cols - 1);
            uvData[ptr * 2 + 1] = j / (rows - 1);
            indexData[ptr] = ptr;

            // Generate Grid connections
            // Connect to right neighbor
            if (i < cols - 1) {
                lineIndices.push(ptr, ptr + rows);
            }
            // Connect to bottom neighbor
            if (j < rows - 1) {
                lineIndices.push(ptr, ptr + 1);
            }

            ptr++;
        }
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    const idxAttrBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idxAttrBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
    const aIndex = gl.getAttribLocation(program, "a_index");
    gl.enableVertexAttribArray(aIndex);
    gl.vertexAttribPointer(aIndex, 1, gl.FLOAT, false, 0, 0);

    // Index Buffer for Lines
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    // Use Uint32Array for large meshes (requires WebGL 2)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(lineIndices), gl.STATIC_DRAW);

    // Init Textures
    videoTextureRef.current = createTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

    maskTextureRef.current = createTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

    buffersRef.current = { vao, numLines: lineIndices.length };
    gl.bindVertexArray(null);
  };

  // --- Hand Tracking ---
  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let frameId: number;

    const setup = async () => {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
        startVideo();
    };

    const startVideo = async () => {
        if (!videoRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = predict;
        } catch(e) { console.error(e) }
    };

    const predict = () => {
        if (!handLandmarker || !videoRef.current) return;
        if (videoRef.current.readyState < 2) {
             frameId = requestAnimationFrame(predict);
             return;
        }
        
        const results = handLandmarker.detectForVideo(videoRef.current, performance.now());
        
        if (results.landmarks && results.landmarks.length > 0) {
             const lm = results.landmarks[0];
             const targetX = 1.0 - lm[9].x; 
             const targetY = lm[9].y;
             
             const dx = targetX - prevHandPos.current.x;
             const dy = targetY - prevHandPos.current.y;
             
             handVel.current.x = handVel.current.x * 0.8 + dx * 0.2;
             handVel.current.y = handVel.current.y * 0.8 + dy * 0.2;

             prevHandPos.current.x = targetX;
             prevHandPos.current.y = targetY;

             handPos.current.x += (targetX - handPos.current.x) * 0.3;
             handPos.current.y += (targetY - handPos.current.y) * 0.3;

             const wrist = lm[0];
             const thumbTip = lm[4];
             const indexTip = lm[8];
             const middleTip = lm[12];
             const middleMcp = lm[9];
             const ringTip = lm[16];
             const ringMcp = lm[13];

             const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
             
             const distMiddleTip = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
             const distMiddleBase = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
             const distRingTip = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
             const distRingBase = Math.hypot(ringMcp.x - wrist.x, ringMcp.y - wrist.y);
             
             const isFist = (distMiddleTip < distMiddleBase * 0.85) && (distRingTip < distRingBase * 0.85);

             if (isFist) {
                 gesture.current = 1; // Fist (Paint)
             } else if (pinchDist < 0.05) {
                 gesture.current = 4; // Pinch (Tension/Ripple)
             } else {
                 gesture.current = 2; // Open (Big Wave)
             }
        } else {
            gesture.current = 0;
            handVel.current.x *= 0.9;
            handVel.current.y *= 0.9;
        }
        frameId = requestAnimationFrame(predict);
    };

    setup();
    return () => cancelAnimationFrame(frameId);
  }, []);

  // --- Offscreen Canvas Init ---
  useEffect(() => {
    revealMaskRef.current = document.createElement('canvas');
    imageCanvasRef.current = document.createElement('canvas');
    const ctx = revealMaskRef.current.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0,0,100,100); 
    }
  }, []);

  // --- Main Render Loop ---
  useEffect(() => {
    initWebGL(config.particleCount);
    
    if (config.staticImage) {
        const img = new Image();
        img.src = config.staticImage;
        img.onload = () => { staticImageRef.current = img; };
    } else {
        staticImageRef.current = null;
    }

    const render = (now: number) => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program || !buffersRef.current.vao) {
            animFrameId.current = requestAnimationFrame(render);
            return;
        }

        const time = (now - startTime.current) / 1000;
        const displayWidth = (gl.canvas as HTMLCanvasElement).clientWidth;
        const displayHeight = (gl.canvas as HTMLCanvasElement).clientHeight;
        
        if (gl.canvas.width !== displayWidth || gl.canvas.height !== displayHeight) {
            gl.canvas.width = displayWidth;
            gl.canvas.height = displayHeight;
            gl.viewport(0, 0, displayWidth, displayHeight);
        }
        
        if (revealMaskRef.current && (revealMaskRef.current.width !== displayWidth || revealMaskRef.current.height !== displayHeight)) {
             const mCanvas = revealMaskRef.current;
             const tempCtx = mCanvas.getContext('2d');
             mCanvas.width = displayWidth;
             mCanvas.height = displayHeight;
             if (tempCtx) {
                 tempCtx.fillStyle = 'black';
                 tempCtx.fillRect(0, 0, displayWidth, displayHeight);
             }
        }

        if (gesture.current === 1 && revealMaskRef.current) { 
            const mCtx = revealMaskRef.current.getContext('2d');
            if (mCtx) {
                const x = handPos.current.x * displayWidth;
                const y = (1.0 - handPos.current.y) * displayHeight;
                const radius = 80;
                
                const g = mCtx.createRadialGradient(x, y, 0, x, y, radius);
                g.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
                g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                
                mCtx.globalCompositeOperation = 'lighten';
                mCtx.fillStyle = g;
                mCtx.beginPath();
                mCtx.arc(x, y, radius, 0, Math.PI * 2);
                mCtx.fill();
            }
        }

        gl.clearColor(0.02, 0.02, 0.02, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.bindVertexArray(buffersRef.current.vao);

        gl.uniform1f(gl.getUniformLocation(program, "u_time"), time);
        gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), displayWidth, displayHeight);
        gl.uniform2f(gl.getUniformLocation(program, "u_hand"), handPos.current.x, handPos.current.y);
        gl.uniform2f(gl.getUniformLocation(program, "u_handVel"), handVel.current.x, -handVel.current.y);
        gl.uniform1f(gl.getUniformLocation(program, "u_gesture"), gesture.current);
        gl.uniform1f(gl.getUniformLocation(program, "u_aspect"), displayWidth / displayHeight);
        gl.uniform1f(gl.getUniformLocation(program, "u_brightness"), config.brightness);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTextureRef.current);
        if (config.staticImage && staticImageRef.current) {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, staticImageRef.current);
        } else if (videoRef.current && videoRef.current.readyState >= 2) {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoRef.current);
        }
        gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTextureRef.current);
        if (revealMaskRef.current) {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, revealMaskRef.current);
        }
        gl.uniform1i(gl.getUniformLocation(program, "u_mask"), 1);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); 

        // Draw Lines instead of Points
        gl.drawElements(gl.LINES, buffersRef.current.numLines, gl.UNSIGNED_INT, 0);

        if (overlayRef.current) {
             const ctx = overlayRef.current.getContext('2d');
             if (ctx) {
                 ctx.clearRect(0, 0, displayWidth, displayHeight);
                 const x = handPos.current.x * displayWidth;
                 const y = (1.0 - handPos.current.y) * displayHeight;
                 
                 if (gesture.current === 1) { // Paint
                     ctx.beginPath();
                     ctx.arc(x, y, 60, 0, Math.PI * 2);
                     ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                     ctx.lineWidth = 1;
                     ctx.stroke();
                     ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                     ctx.fill();
                 } else if (gesture.current === 4) { // Pinch
                     ctx.beginPath();
                     ctx.arc(x, y, 20, 0, Math.PI * 2);
                     ctx.strokeStyle = 'rgba(200, 100, 200, 0.6)';
                     ctx.stroke();
                 } else if (gesture.current === 2) { // Open (Wave)
                     ctx.beginPath();
                     ctx.arc(x, y, 50, 0, Math.PI * 2);
                     ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
                     ctx.setLineDash([5, 5]);
                     ctx.stroke();
                     ctx.setLineDash([]);
                 }
             }
        }

        animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameId.current);
  }, [config.particleCount, config.staticImage, config.brightness]); 

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 bg-[#050505]">
       <video ref={videoRef} id="webcam" autoPlay playsInline muted className="absolute opacity-0 pointer-events-none z-[-1]" width="640" height="480"></video>
       <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full z-0" />
       <canvas ref={overlayRef} className="absolute inset-0 block w-full h-full z-10 pointer-events-none" />
    </div>
  );
};
