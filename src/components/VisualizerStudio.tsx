import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize, ChevronRight } from 'lucide-react';
import * as THREE from 'three';



interface VisualizerStudioProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onClose: () => void;
}

export function VisualizerStudio({ audioRef, isPlaying, onClose }: VisualizerStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reqRef = useRef<number>(0);
  const [effectIndex, setEffectIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPromoVideo, setShowPromoVideo] = useState(false);

  const numEffects = 3;

  const dataArrayFreqRef = useRef<Uint8Array>(new Uint8Array(1024));
  const dataArrayTimeRef = useRef<Uint8Array>(new Uint8Array(1024));
  
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeSetupRef = useRef<any>(null);
  const lastInitEffectRef = useRef(-1);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  /*
  useEffect(() => {
    const cycleInterval = setInterval(() => {
      setEffectIndex((prev) => (prev + 1) % numEffects);
    }, 15000);
    return () => clearInterval(cycleInterval);
  }, []);
  */

  // Timer pro promo video - DOČASNĚ DEAKTIVOVÁNO na žádost uživatele (překážel obdélník)
  /*
  useEffect(() => {
    const promoInterval = setInterval(() => {
      setShowPromoVideo(true);
      setEffectIndex(3);
    }, 60000); 
    return () => clearInterval(promoInterval);
  }, []);
  */

  useEffect(() => {
    const audio = audioRef.current;
    
    // @ts-expect-error
    const analyser = audio?.__analyser as AnalyserNode | undefined;

    if (analyser && dataArrayFreqRef.current.length !== analyser.frequencyBinCount) {
      dataArrayFreqRef.current = new Uint8Array(analyser.frequencyBinCount);
      dataArrayTimeRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (lastInitEffectRef.current !== effectIndex) {
        if (threeSetupRef.current) {
            if (threeSetupRef.current.renderer) threeSetupRef.current.renderer.dispose();
            threeSetupRef.current = null;
        }
        lastInitEffectRef.current = effectIndex;
    }

    if (effectIndex === 1 && threeCanvasRef.current && !threeSetupRef.current) {
      // --- EFFECT 2: CYBER MATRIX SPHERE ---
      const tCanvas = threeCanvasRef.current;
      tCanvas.width = canvas.clientWidth;
      tCanvas.height = canvas.clientHeight;
      const renderer = new THREE.WebGLRenderer({ canvas: tCanvas, antialias: true, alpha: true });
      renderer.setSize(tCanvas.width, tCanvas.height, false);
      renderer.toneMapping = THREE.ReinhardToneMapping;
      
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x01030d); 
      scene.fog = new THREE.FogExp2(0x01030d, 0.003); 
      
      const camera = new THREE.PerspectiveCamera(65, tCanvas.width / tCanvas.height, 0.1, 1000);
      camera.position.set(0, 0, 70); 
      camera.lookAt(0, 0, 0);

      const sphereGroup = new THREE.Group();
      scene.add(sphereGroup);

      // Core Heart (Tepající střed)
      const coreGeo = new THREE.IcosahedronGeometry(8, 2);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.8 });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      sphereGroup.add(coreMesh);

      // Outer Grid (Obal klece)
      const outerGeo = new THREE.IcosahedronGeometry(35, 3);
      const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.25 });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      sphereGroup.add(outerMesh);

      // Dust Particles
      const numStars = 500;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(numStars * 3);
      for(let i=0; i<numStars; i++) {
         const r = 40 + Math.random() * 60;
         const a = Math.random() * Math.PI * 2;
         const b = Math.random() * Math.PI * 2;
         starPos[i*3] = r * Math.sin(a) * Math.cos(b);
         starPos[i*3+1] = r * Math.sin(a) * Math.sin(b);
         starPos[i*3+2] = r * Math.cos(a);
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 0.4, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
      const stars = new THREE.Points(starGeo, starMat);
      sphereGroup.add(stars);

      threeSetupRef.current = { renderer, scene, camera, sphereGroup, coreMesh, outerMesh, stars, rotAngle: 0 };
    } else if (effectIndex === 2 && threeCanvasRef.current && !threeSetupRef.current) {
      // --- EFFECT 3: AUDIO MOUNTAINS ---
      const tCanvas = threeCanvasRef.current;
      tCanvas.width = canvas.clientWidth;
      tCanvas.height = canvas.clientHeight;
      const renderer = new THREE.WebGLRenderer({ canvas: tCanvas, antialias: true, alpha: true });
      renderer.setSize(tCanvas.width, tCanvas.height, false);
      renderer.toneMapping = THREE.ReinhardToneMapping;
      
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020516);
      scene.fog = new THREE.FogExp2(0x020516, 0.012); 
      
      const camera = new THREE.PerspectiveCamera(75, tCanvas.width / tCanvas.height, 0.1, 1000);
      camera.position.set(0, 5, 20); 
      camera.lookAt(0, 0, -50);

      // Terrain Plane (Z=0 až Z=-200)
      const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
      terrainGeo.rotateX(-Math.PI / 2);
      
      const terrainMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.4 });
      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.position.y = -5;
      terrainMesh.position.z = -130;
      scene.add(terrainMesh);

      const baseVertices = new Float32Array(terrainGeo.attributes.position.array);

      // Zářivá čára na horizontu
      const horizonGeo = new THREE.PlaneGeometry(400, 0.5);
      const horizonMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.6 });
      const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
      horizonMesh.position.set(0, 0, -180);
      scene.add(horizonMesh);

      threeSetupRef.current = { renderer, scene, camera, terrainMesh, baseVertices, travelDist: 0 };
    } else if (effectIndex === 0 && threeCanvasRef.current && !threeSetupRef.current) {
      // --- EFFECT 6: THE HYPERSPACE PORTAL (COHESIVE TUNNEL) ---
      const tCanvas = threeCanvasRef.current;
      tCanvas.width = canvas.clientWidth;
      tCanvas.height = canvas.clientHeight;
      const renderer = new THREE.WebGLRenderer({ canvas: tCanvas, antialias: true, alpha: true });
      renderer.setSize(tCanvas.width, tCanvas.height, false);
      renderer.toneMapping = THREE.ReinhardToneMapping;
      const scene = new THREE.Scene();
      // Navy Blue
      scene.background = new THREE.Color(0x020516); 
      // Fog je extrémně důležitý pro pocit hlubokého portálu (navy blue)
      scene.fog = new THREE.FogExp2(0x020516, 0.005); 

      const camera = new THREE.PerspectiveCamera(85, tCanvas.width / tCanvas.height, 0.1, 1000);
      camera.position.set(0, 0, 20); // Kamera čistě uprostřed
      camera.lookAt(0, 0, -100);

      const tunnelGroup = new THREE.Group();
      scene.add(tunnelGroup);

      // CYLINDER TUNNEL 1 (Cyan)
      const tunnelLength = 600;
      const tunnelSegments = 80;
      const segmentSize = tunnelLength / tunnelSegments; // Klíč pro infinite loop (7.5)
      
      const cynGeo = new THREE.CylinderGeometry(20, 20, tunnelLength, 32, tunnelSegments, true);
      cynGeo.rotateX(Math.PI / 2); // Položit válec
      
      const cynMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.4 });
      const cynMesh = new THREE.Mesh(cynGeo, cynMat);
      cynMesh.position.z = -tunnelLength / 2; // Střed válce posunut
      tunnelGroup.add(cynMesh);

      // CYLINDER TUNNEL 2 (Magenta - Mírně větší, pro parallax efekt drátů)
      const magGeo = new THREE.CylinderGeometry(23, 23, tunnelLength, 24, tunnelSegments, true);
      magGeo.rotateX(Math.PI / 2);
      
      const magMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.25 });

      const magMesh = new THREE.Mesh(magGeo, magMat);
      magMesh.position.z = -tunnelLength / 2;
      tunnelGroup.add(magMesh);

      // Jádro Portálu VYMAZÁNO - konec tunelu je nyní temná mlha (žádné 'světlo na konci nebe')

      // Vesmírný prach letící tunelem
      const numStars = 400; // Drasticky sníženo kvůli aditivnímu oslnění v dálce
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(numStars * 3);
      for(let i=0; i<numStars; i++) {
          const angle = Math.random() * Math.PI * 2;
          // Zásadní fix: Hvězdy se rodí pouze NA KRAJÍCH tunelu (poloměr 8 až 18)
          // To zabrání tomu, aby se v prostředku tunelu překryly do jedné obří oslňující bílé koule!
          const radius = 8 + Math.random() * 10; 
          starPos[i*3] = Math.cos(angle) * radius;
          starPos[i*3+1] = Math.sin(angle) * radius;
          starPos[i*3+2] = Math.random() * -300; 
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 0.5, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
      const stars = new THREE.Points(starGeo, starMat);
      tunnelGroup.add(stars);

      // Postprocessing pro masivní Glow!
      threeSetupRef.current = { 
         renderer, scene, camera,
         tunnelGroup, cynMesh, cynMat, magMesh, magMat,
         stars,
         segmentSize, travelDist: 0,
         rotSpeed: 0
      };
    }

const renderLoop = () => {
      reqRef.current = requestAnimationFrame(renderLoop);

      // CAPPING RENDERING RESOLUTION pro záchranu FPS
      // Omezením vnitřního rozlišení (např. na 800px) dramaticky snížíme zátěž na starších GPU kiosku.
      // Přidali jsme MSAA 4x vzorkování, takže hrany neonových čar budou i na 4K displeji hladké!
      
      const scale = window.devicePixelRatio || 1;
      const targetW = canvas.clientWidth;
      const targetH = canvas.clientHeight;
      
      if (canvas.width !== Math.floor(targetW * scale) || canvas.height !== Math.floor(targetH * scale)) {
        canvas.width = Math.floor(targetW * scale);
        canvas.height = Math.floor(targetH * scale);

        if (threeSetupRef.current && threeCanvasRef.current) {
          threeCanvasRef.current.width = targetW;
          threeCanvasRef.current.height = targetH;
          threeSetupRef.current.renderer.setSize(targetW, targetH, false);
          threeSetupRef.current.camera.aspect = targetW / targetH;
          threeSetupRef.current.camera.updateProjectionMatrix();
        }
      }

      const freqData = dataArrayFreqRef.current;
      const timeData = dataArrayTimeRef.current;

      if (analyser) {
         analyser.getByteFrequencyData(freqData);
         analyser.getByteTimeDomainData(timeData);
      }

      if (effectIndex === 1) {
        // --- Effect 2: Matrix Sphere Update ---
        if (analyser && dataArrayFreqRef.current) analyser.getByteFrequencyData(dataArrayFreqRef.current);
        const freqData = dataArrayFreqRef.current || new Uint8Array(1024);
        
        if (threeSetupRef.current) {
           const setup = threeSetupRef.current;
            
           
           let avgBass = 0; for(let i=0; i<6; i++) avgBass += freqData[i]; avgBass /= 6;
           let avgHigh = 0; for(let i=100; i<150; i++) avgHigh += freqData[i]; avgHigh /= 50;
           if (!isPlaying) { avgBass = 0; avgHigh = 0; }
           
           const bassBoost = avgBass / 255.0;
           const highBoost = avgHigh / 255.0;

           setup.rotAngle += 0.002 + bassBoost * 0.005;
           
           setup.camera.position.x = Math.sin(setup.rotAngle) * 75;
           setup.camera.position.z = Math.cos(setup.rotAngle) * 75;
           setup.camera.position.y = Math.sin(setup.rotAngle * 0.5) * 20;
           setup.camera.lookAt(0, 0, 0);

           setup.coreMesh.rotation.y -= 0.01 + bassBoost * 0.02;
           setup.coreMesh.rotation.x -= 0.005;
           const coreScale = 1.0 + bassBoost * 1.5;
           setup.coreMesh.scale.set(coreScale, coreScale, coreScale);

           const outScale = 1.0 + bassBoost * 0.1;
           setup.outerMesh.scale.set(outScale, outScale, outScale);

           setup.sphereGroup.rotation.y = setup.rotAngle * 0.2;

           if (highBoost > 0.8) {
               setup.coreMesh.material.color.setHex(0xccffff); 
           } else {
               setup.coreMesh.material.color.setHex(0xff00ff);
           }

           setup.renderer.render(setup.scene, setup.camera);
        }
      } else if (effectIndex === 2) {
        // --- Effect 3: Audio Mountains Update ---
        if (analyser && dataArrayFreqRef.current) analyser.getByteFrequencyData(dataArrayFreqRef.current);
        const freqData = dataArrayFreqRef.current || new Uint8Array(1024);
        
        if (threeSetupRef.current) {
           const setup = threeSetupRef.current;
            
           
           let avgBass = 0; for(let i=0; i<6; i++) avgBass += freqData[i]; avgBass /= 6;
           let avgMid = 0; for(let i=12; i<40; i++) avgMid += freqData[i]; avgMid /= 28;
           if (!isPlaying) { avgBass = 0; avgMid = 0; }
           
           const bassBoost = avgBass / 255.0;
           
           const speed = 10.0 + (avgMid / 255.0) * 15.0;
           setup.travelDist += speed * 0.016;
           
           const posAttr = setup.terrainMesh.geometry.attributes.position;
           const baseV = setup.baseVertices;
           
           for(let i=0; i < posAttr.count; i++) {
              const x = baseV[i*3];
              const z = baseV[i*3+2];
              const worldZ = z + setup.travelDist;
              
              const distFromCenter = Math.abs(x);
              let y = 0;
              
              if (distFromCenter > 10) { 
                 const pathDist = distFromCenter - 10;
                 const nx = x * 0.05;
                 const nz = worldZ * 0.03;
                 let elevation = Math.sin(nx) * Math.cos(nz) + Math.sin(nx * 2.1 + nz * 1.3) * 0.5;
                 elevation = Math.max(0, elevation) * pathDist * 0.4;
                 
                 y = elevation * (1.0 + bassBoost * 4.0);
              }
              posAttr.setY(i, y);
           }
           posAttr.needsUpdate = true;
           
           setup.camera.position.x = Math.sin(Date.now() * 0.001) * 2.0;
           setup.camera.position.y = 5.0 + Math.abs(Math.cos(Date.now() * 0.002)) * 1.5 - bassBoost * 1.5; 
           
           setup.renderer.render(setup.scene, setup.camera);
        }
      } else if (effectIndex === 0) {
        // --- Effect 6: Hyperspace Portal ---
        if (analyser && dataArrayFreqRef.current) analyser.getByteFrequencyData(dataArrayFreqRef.current);
        const freqData = dataArrayFreqRef.current || new Uint8Array(1024);
        
        if (threeSetupRef.current) {
           const setup = threeSetupRef.current;
            
          
           let avgBass = 0; for(let i=0; i<6; i++) avgBass += freqData[i]; avgBass /= 6;
           let avgMid = 0; for(let i=12; i<40; i++) avgMid += freqData[i]; avgMid /= 28;
           let avgHigh = 0; for(let i=80; i<150; i++) avgHigh += freqData[i]; avgHigh /= 70;

           if (!isPlaying) { avgBass = 0; avgMid = 0; avgHigh = 0; }

           const bassBoost = avgBass / 255.0;
           const midBoost = avgMid / 255.0;
           const highBoost = avgHigh / 255.0;

           // Tunel Flight Logic (Nekonečný průlet vázaný na grid loop)
           // Rychlost letu určuje středová frekvence
           const flyingSpeed = 30 + (midBoost * 120);
           setup.travelDist += flyingSpeed * 0.016;
           
           // Modulo snap zajistí nekonečný průlet bez posunutí kamery
           // Hýbeme oběma válci dopředu. Když urazí vzdálenost jednoho segmentu, skočí zpět.
           const zPos = (setup.travelDist % setup.segmentSize);
           setup.cynMesh.position.z = (-600 / 2) + zPos;
           setup.magMesh.position.z = (-600 / 2) + zPos;

           // Stars flight
           const posAttr = setup.stars.geometry.attributes.position;
           const starArr = posAttr.array;
           for(let i=0; i<400; i++) {
              starArr[i*3+2] += flyingSpeed * 0.016 * 1.5; // hvězdy letí trochu rychleji
              if (starArr[i*3+2] > 20) {
                  starArr[i*3+2] = -300; // Objeví se vzadu
                  const a = Math.random() * Math.PI * 2;
                  const r = 8 + Math.random() * 10;
                  starArr[i*3] = Math.cos(a) * r;
                  starArr[i*3+1] = Math.sin(a) * r;
              }
           }
           posAttr.needsUpdate = true;

           // Portal Rotation (Pocit že celý prostor rotuje okolo jako celek)
           const targetSpin = 0.005 + (bassBoost * 0.02);
           setup.rotSpeed += (targetSpin - setup.rotSpeed) * 0.05;
           setup.tunnelGroup.rotation.z += setup.rotSpeed; // Celý tunel rotuje

           // Wobble kamery pro více kinetický pocit
           setup.camera.rotation.z = Math.sin(Date.now()*0.001) * 0.1;
           setup.camera.position.x = Math.sin(Date.now()*0.002) * (1.0 + bassBoost);
           setup.camera.position.y = Math.cos(Date.now()*0.0015) * (1.0 + bassBoost);

           // Záblesky celého tunelu
           if (highBoost > 0.85) { // Flash pouze na extrémně silných výškách
               setup.cynMat.color.setHex(0xccffff); // Světlejší cyan, nikoliv čistá bílá
               setup.magMat.color.setHex(0xffccff); // Světlejší pink
           } else {
               // Plynulý přechod barev uvnitř mřížky
               const cCyan = new THREE.Color(0x00f3ff);
               const cPurple = new THREE.Color(0xff00ff);
               setup.cynMat.color.copy(cCyan).lerp(cPurple, midBoost);
               
               // MagMesh stabilní
               setup.magMat.color.setHex(0xff00ff);
           }

           // Pulse zkracování/nafukování tunelu (dýchání)
           setup.tunnelGroup.scale.x = 1.0 + bassBoost * 0.15;
           setup.tunnelGroup.scale.y = 1.0 + bassBoost * 0.15;

           setup.renderer.render(setup.scene, setup.camera);
        }
    }
    };

    renderLoop();

    return () => cancelAnimationFrame(reqRef.current);
  }, [isPlaying, effectIndex]);

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-hidden ${!isFullscreen ? 'rounded-3xl border-2 border-cyan-500/20 shadow-[0_0_50px_rgba(0,243,255,0.15)] m-4' : ''}`}
    >
      <canvas ref={canvasRef} className={`w-full h-full absolute inset-0 z-0 transition-opacity duration-300 ${(effectIndex === 0 || effectIndex === 1 || effectIndex === 2) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} />
      <canvas ref={threeCanvasRef} className={`w-full h-full absolute inset-0 z-0 transition-opacity duration-300 ${(effectIndex === 0 || effectIndex === 1 || effectIndex === 2) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      
      {/* Promo Ticker Trailer */}
      {showPromoVideo && (
        <video 
          src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" 
          autoPlay 
          muted 
          onEnded={() => setShowPromoVideo(false)}
          className="absolute z-40 max-w-[85vw] max-h-[85vh] w-auto h-auto rounded-xl border-4 border-cyan-500/30 shadow-[0_0_100px_rgba(248,0,255,0.4)] object-contain pointer-events-none drop-shadow-2xl opacity-90 transition-opacity duration-1000"
        />
      )}
      
      {/* Controls Overlay */}
      <div className={`absolute top-0 w-full p-6 flex justify-between items-start transition-opacity duration-500 opacity-0 hover:opacity-100 ${!isFullscreen ? 'opacity-100' : ''}`}>
        <button 
          onClick={onClose}
          title="Zavřít Visualizer"
          className="p-3 bg-slate-900/80 rounded-full border border-white/10 text-slate-300 hover:text-pink-500 hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(255,0,255,0.5)] transition-all backdrop-blur-md"
        >
          <X size={28} />
        </button>

        <div className="flex gap-4">
          <button 
            onClick={() => setEffectIndex((p) => (p + 1) % numEffects)}
            title="Přepnout vizualizaci"
            className="p-3 font-semibold tracking-wide bg-slate-900/80 rounded-full border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)] transition-all backdrop-blur-md flex items-center gap-2"
          >
            <ChevronRight size={24} /> Mode {effectIndex + 1}
          </button>
          
          <button 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Ukončit Fullscreen" : "Fullscreen"}
            className={`p-3 bg-slate-900/80 rounded-full border-2 transition-all backdrop-blur-md ${isFullscreen ? 'border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.5)]' : 'border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)]'}`}
          >
            <Maximize size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
