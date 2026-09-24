import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1922);
scene.fog = new THREE.FogExp2(0x0b1922, 0.0115);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 3.1, 8.5);
camera.lookAt(0, 1, -25);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

scene.add(new THREE.HemisphereLight(0x63839b, 0x14201c, 1.45));
const moonLight = new THREE.DirectionalLight(0x9eb8ca, 1.2);
moonLight.position.set(-30, 35, -40);
scene.add(moonLight);

// Soft moon and sparse stars.
const moon = new THREE.Mesh(new THREE.SphereGeometry(3.8, 24, 24), new THREE.MeshBasicMaterial({ color: 0xe8d5bd, fog: false }));
moon.position.set(37, 30, -120);
scene.add(moon);
const starGeo = new THREE.BufferGeometry();
const stars = [];
for (let i = 0; i < 260; i++) stars.push((Math.random() - .5) * 300, 15 + Math.random() * 85, -20 - Math.random() * 250);
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaac1ca, size: .15, transparent: true, opacity: .65, fog: false })));

const world = new THREE.Group();
scene.add(world);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x172126, roughness: .95 });
const vergeMat = new THREE.MeshStandardMaterial({ color: 0x23372f, roughness: 1, flatShading: true });
const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8c79b });
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xd8d7c7 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x17221d, flatShading: true });
const pineMats = [0x1c3029, 0x233d33, 0x29443a].map(color => new THREE.MeshStandardMaterial({ color, flatShading:true, roughness:1 }));
const roadSegments = [];
const SEG = 20;

function makePine(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,1.6,5),trunkMat); trunk.position.y=.8; g.add(trunk);
  for(let i=0;i<3;i++){
    const crown = new THREE.Mesh(new THREE.ConeGeometry((1.5-i*.25)*scale,3.3*scale,7), pineMats[(Math.random()*3)|0]);
    crown.position.y=1.9+i*1.25*scale; crown.rotation.y=Math.random(); g.add(crown);
  }
  g.position.set(x,0,z); g.rotation.z=(Math.random()-.5)*.04; return g;
}
function makeMountain(x,z,s){
  const geo=new THREE.ConeGeometry(s,s*1.35,5); geo.rotateY(Math.random());
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:x<0?0x1a2b2a:0x203333,flatShading:true,roughness:1}));
  mesh.position.set(x,s*.55,z); return mesh;
}
function createSegment(index) {
  const group = new THREE.Group();
  group.position.z = -index * SEG;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11, SEG+.15), roadMat); road.rotation.x=-Math.PI/2; road.position.y=.025; group.add(road);
  for(const x of [-20,20]) { const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,SEG+.2),vergeMat); ground.rotation.x=-Math.PI/2;ground.position.set(x,0,0);group.add(ground); }
  for(const x of [-5.25,5.25]) { const edge=new THREE.Mesh(new THREE.PlaneGeometry(.11,SEG),edgeMat); edge.rotation.x=-Math.PI/2;edge.position.set(x,.055,0);group.add(edge); }
  for(let z=-SEG/2+1;z<SEG/2;z+=6){ const dash=new THREE.Mesh(new THREE.PlaneGeometry(.12,2.4),lineMat);dash.rotation.x=-Math.PI/2;dash.position.set(0,.06,z);group.add(dash); }
  for(let side of [-1,1]){
    const count=2+((Math.random()*3)|0);
    for(let t=0;t<count;t++) group.add(makePine(side*(8+Math.random()*15),(Math.random()-.5)*SEG,.65+Math.random()*.9));
  }
  world.add(group); roadSegments.push(group);
}
for(let i=0;i<18;i++) createSegment(i);
for(let i=0;i<22;i++){ const side=Math.random()<.5?-1:1; world.add(makeMountain(side*(22+Math.random()*65),-35-Math.random()*280,10+Math.random()*28)); }

// Player car: intentionally simple, seen from just behind.
const car = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({color:0x9b4d3f,roughness:.55,metalness:.15});
const body = new THREE.Mesh(new THREE.BoxGeometry(2.15,.55,4.15),bodyMat); body.position.y=.68; car.add(body);
const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9,.28,1.35),bodyMat);hood.position.set(0,1.02,-1.28);car.add(hood);
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7,.72,1.85),new THREE.MeshStandardMaterial({color:0x18242a,roughness:.2}));cabin.position.set(0,1.28,.25);car.add(cabin);
for(const x of [-.92,.92]) for(const z of [-1.25,1.25]){ const tire=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.28,12),new THREE.MeshStandardMaterial({color:0x080a0b}));tire.rotation.z=Math.PI/2;tire.position.set(x,.48,z);car.add(tire); }
for(const x of [-.7,.7]){ const tail=new THREE.Mesh(new THREE.BoxGeometry(.42,.18,.05),new THREE.MeshBasicMaterial({color:0xff5d48}));tail.position.set(x,.75,2.09);car.add(tail); }
car.position.set(0,0,2.2); scene.add(car);

// Headlights pool ahead.
for(const x of [-.65,.65]){ const spot=new THREE.SpotLight(0xffe0ae,28,55,.43,.7,1.3);spot.position.set(x,1,-.1);spot.target.position.set(x,0,-32);car.add(spot,spot.target); }

const input={left:false,right:false,up:false,down:false};
let started=false,speed=0,targetSpeed=0,distance=0,steer=0,last=performance.now();
const intro=document.querySelector('#intro'),hud=document.querySelector('#hud');
function begin(){started=true;targetSpeed=70;intro.classList.add('hidden');hud.classList.add('visible');}
document.querySelector('#start').addEventListener('click',begin);
const keys={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(!started)begin();else targetSpeed=targetSpeed?0:70;} if(keys[e.key]){input[keys[e.key]]=true;if(!started)begin();}});
addEventListener('keyup',e=>{if(keys[e.key])input[keys[e.key]]=false;});

const about=document.querySelector('#about');
document.querySelector('#about-open').onclick=()=>{about.classList.add('open');about.setAttribute('aria-hidden','false')};
document.querySelector('#about-close').onclick=()=>{about.classList.remove('open');about.setAttribute('aria-hidden','true')};

// Tiny generated ambient engine: no downloaded audio required.
let audio, master;
document.querySelector('#sound-toggle').onclick=()=>{
  const button=document.querySelector('#sound-toggle');
  if(!audio){audio=new AudioContext();master=audio.createGain();master.gain.value=.045;master.connect(audio.destination);for(const f of [55,82.4,110]){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.value=f===55?.7:.22;o.connect(g).connect(master);o.start();}}
  const on=!button.classList.contains('sound-on');button.classList.toggle('sound-on',on);master.gain.setTargetAtTime(on?.045:0,audio.currentTime,.5);document.querySelector('#sound-label').textContent=on?'SOUND ON':'SOUND OFF';
};

function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;
  if(input.up) targetSpeed=Math.min(115,targetSpeed+35*dt); if(input.down)targetSpeed=Math.max(0,targetSpeed-55*dt);
  speed+=(targetSpeed-speed)*dt*1.6;
  const desired=(input.left?1:0)-(input.right?1:0);steer+=(desired-steer)*dt*4;
  car.position.x=THREE.MathUtils.clamp(car.position.x+steer*dt*4.2,-3.8,3.8);car.rotation.z=steer*.07;camera.position.x+=(car.position.x*.22-camera.position.x)*dt*2;
  if(started){const movement=speed*dt*.055; distance+=speed*dt/3600; for(const seg of roadSegments){seg.position.z+=movement;if(seg.position.z>SEG)seg.position.z-=roadSegments.length*SEG;} for(const obj of world.children){if(!roadSegments.includes(obj) && obj.geometry){obj.position.z+=movement;if(obj.position.z>20)obj.position.z-=310;}}}
  moon.position.x=37-camera.position.x*.1;
  document.querySelector('#speed').textContent=Math.round(speed).toString().padStart(2,'0');document.querySelector('#distance').textContent=distance.toFixed(1)+' KM';
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
